import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { MemoryAuthKeyCache } from "../../src/auth/authKeyCache.js"
import { AuthKeyExpiredError } from "../../src/gacha/errors.js"
import { GenshinSyncService } from "../../src/gacha/genshinSyncService.js"
import { RecordStore } from "../../src/storage/recordStore.js"

const role = {
  game: "genshin",
  gameBiz: "hk4e_cn",
  uid: "123456789",
  region: "cn_gf01",
  regionName: "天空岛",
}
const credential = {
  accountId: "10001",
  mid: "20002",
  stoken: "fixture-stoken",
  device: { id: "A".repeat(32), name: "Android-test", model: "MTEST" },
  roles: [role],
  selectedRoles: { genshin: role.uid },
}

function apiItem(pool) {
  return {
    id: `${pool.queryType}0001`,
    gacha_type: pool.queryType,
    name: `fixture-${pool.queryType}`,
    item_type: "角色",
    rank_type: "5",
    count: "1",
    time: "2026-08-02 00:00:00",
    lang: "zh-cn",
  }
}

async function fixture(context, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hoyo-sync-test-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  let generated = 0
  const service = new GenshinSyncService({
    credentialStore: overrides.credentialStore ?? { load: async () => credential },
    authKeyClient: {
      generate: async () => {
        generated += 1
        return `fixture-authkey-${generated}`
      },
    },
    authKeyCache: new MemoryAuthKeyCache(),
    gachaClient:
      overrides.gachaClient ??
      ({ fetchPage: async ({ pool }) => ({ list: [apiItem(pool)] }) }),
    recordStore: new RecordStore({ directory }),
    pageDelayMs: 0,
  })
  return { service, generated: () => generated }
}

test("syncs all five Genshin pools and the second run adds zero", async context => {
  const { service, generated } = await fixture(context)
  const progress = []
  const first = await service.sync("user-a", { onProgress: event => progress.push(event) })
  const second = await service.sync("user-a")

  assert.equal(first.added, 5)
  assert.equal(first.pools.length, 5)
  assert.equal(second.added, 0)
  assert.equal(second.total, 5)
  assert.equal(generated(), 1)
  assert.deepEqual(
    progress.map(event => [event.index, event.total, event.poolName, event.status]),
    [
      [1, 5, "新手祈愿", "completed"],
      [2, 5, "常驻祈愿", "completed"],
      [3, 5, "角色活动祈愿", "completed"],
      [4, 5, "武器活动祈愿", "completed"],
      [5, 5, "集录祈愿", "completed"],
    ],
  )
})

test("an expired authkey is refreshed only once", async context => {
  let requests = 0
  const { service, generated } = await fixture(context, {
    gachaClient: {
      fetchPage: async ({ pool }) => {
        requests += 1
        if (requests === 1) throw new AuthKeyExpiredError(-101)
        return { list: [apiItem(pool)] }
      },
    },
  })
  const result = await service.sync("user-b")
  assert.equal(result.added, 5)
  assert.equal(result.refreshedAuthkey, true)
  assert.equal(generated(), 2)
})

test("imports a trusted URL without persisting its authkey", async context => {
  const { service, generated } = await fixture(context, {
    credentialStore: { load: async () => undefined },
  })
  const url = new URL("https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog")
  url.search = new URLSearchParams({
    authkey_ver: "1",
    sign_type: "2",
    auth_appid: "webview_gacha",
    authkey: "fixture-import-authkey",
    game_biz: "hk4e_cn",
    region: "cn_gf01",
    lang: "zh-cn",
    gacha_type: "301",
  })
  const result = await service.syncImported("user-c", url.href, { uid: role.uid })
  assert.equal(result.added, 5)
  assert.equal(generated(), 0)
  assert.equal(
    JSON.stringify(await service.recordStore.load("user-c", role)).includes("authkey"),
    false,
  )
})
