import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { MemoryAuthKeyCache } from "../../src/auth/authKeyCache.js"
import { StarRailSyncService } from "../../src/gacha/starRailSyncService.js"
import { ZzzSyncService } from "../../src/gacha/zzzSyncService.js"
import { RecordStore } from "../../src/storage/recordStore.js"

const starRailRole = {
  game: "starrail",
  gameBiz: "hkrpg_cn",
  uid: "100000001",
  region: "prod_gf_cn",
  regionName: "星穹列车",
}
const zzzRole = {
  game: "zzz",
  gameBiz: "nap_cn",
  uid: "10000002",
  region: "prod_gf_cn",
  regionName: "新艾利都",
}

function credential(role) {
  return {
    accountId: "10001",
    mid: "20002",
    stoken: "fixture-stoken",
    device: { id: "A".repeat(32), name: "Android-test", model: "MTEST" },
    roles: [role],
    selectedRoles: { [role.game]: role.uid },
  }
}

function recordId(pool) {
  return `${pool.queryType.padStart(3, "0")}0000001`
}

function item(game, pool) {
  return {
    id: recordId(pool),
    gacha_type: game === "zzz" ? pool.longType : pool.queryType,
    real_gacha_type: game === "zzz" ? pool.queryType : undefined,
    name: `fixture-${game}-${pool.queryType}`,
    item_type: "fixture-item",
    rank_type: "5",
    count: "1",
    time: "2026-08-02 00:00:00",
    lang: "zh-cn",
  }
}

async function fixture(context, Service, game, role, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), `xinghan-${game}-sync-`))
  context.after(() => rm(directory, { recursive: true, force: true }))
  let generated = 0
  const requests = []
  const service = new Service({
    credentialStore: overrides.credentialStore ?? { load: async () => credential(role) },
    authKeyClient: {
      generate: async () => {
        generated += 1
        return `fixture-authkey-${generated}`
      },
    },
    authKeyCache: new MemoryAuthKeyCache(),
    gachaClient: {
      fetchPage: async request => {
        requests.push(request)
        return { list: [item(game, request.pool)] }
      },
    },
    recordStore: new RecordStore({ directory }),
    pageDelayMs: 0,
  })
  return { service, generated: () => generated, requests }
}

function importedUrl(base, params) {
  const url = new URL(base)
  url.search = new URLSearchParams({
    authkey_ver: "1",
    sign_type: "2",
    auth_appid: "webview_gacha",
    authkey: "fixture-import-authkey",
    lang: "zh-cn",
    ...params,
  })
  return url.href
}

test("syncs all six Star Rail pools with collaboration routing metadata", async context => {
  const { service, generated, requests } = await fixture(
    context,
    StarRailSyncService,
    "starrail",
    starRailRole,
  )
  const first = await service.sync("user-starrail")
  const second = await service.sync("user-starrail")

  assert.deepEqual(
    first.pools.map(pool => pool.pool),
    ["1", "2", "11", "12", "21", "22"],
  )
  assert.deepEqual(
    first.pools.map(pool => pool.endpointKind),
    ["standard", "standard", "standard", "standard", "collaboration", "collaboration"],
  )
  assert.equal(first.added, 6)
  assert.equal(second.added, 0)
  assert.equal(second.total, 6)
  assert.equal(generated(), 1)
  assert.equal(requests.every(request => request.market === "cn"), true)
})

test("imports a global Star Rail URL and uses all six trusted pools", async context => {
  const globalRole = {
    game: "starrail",
    gameBiz: "hkrpg_global",
    uid: "700000001",
    region: "prod_official_eur",
  }
  const { service, generated, requests } = await fixture(
    context,
    StarRailSyncService,
    "starrail",
    globalRole,
    { credentialStore: { load: async () => undefined } },
  )
  const url = importedUrl(
    "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getLdGachaLog",
    {
      game_biz: globalRole.gameBiz,
      region: globalRole.region,
      gacha_type: "21",
    },
  )

  const result = await service.syncImported("user-starrail-global", url, { uid: globalRole.uid })
  assert.equal(result.added, 6)
  assert.equal(result.market, "global")
  assert.equal(generated(), 0)
  assert.equal(requests.every(request => request.market === "global"), true)
})

test("syncs and canonicalizes all six ZZZ short and long pool types", async context => {
  const { service, generated } = await fixture(context, ZzzSyncService, "zzz", zzzRole)
  const first = await service.sync("user-zzz")
  const second = await service.sync("user-zzz")
  const stored = await service.recordStore.load("user-zzz", zzzRole)

  assert.deepEqual(
    first.pools.map(pool => pool.pool),
    ["1", "2", "3", "5", "102", "103"],
  )
  assert.deepEqual(
    stored.map(record => record.gachaType).sort(),
    ["1", "102", "103", "2", "3", "5"],
  )
  assert.equal(first.added, 6)
  assert.equal(second.added, 0)
  assert.equal(second.total, 6)
  assert.equal(generated(), 1)
})

test("imports a trusted ZZZ common-alias URL without persisting authkey", async context => {
  const { service, generated, requests } = await fixture(
    context,
    ZzzSyncService,
    "zzz",
    zzzRole,
    { credentialStore: { load: async () => undefined } },
  )
  const url = importedUrl(
    "https://public-operation-common.mihoyo.com/common/gacha_record/api/getGachaLog",
    {
      game_biz: zzzRole.gameBiz,
      region: zzzRole.region,
      gacha_type: "13001",
      real_gacha_type: "103",
    },
  )

  const result = await service.syncImported("user-zzz-import", url, { uid: zzzRole.uid })
  const stored = await service.recordStore.load("user-zzz-import", zzzRole)
  assert.equal(result.added, 6)
  assert.equal(generated(), 0)
  assert.equal(requests.every(request => request.game === "zzz"), true)
  assert.equal(JSON.stringify(stored).includes("authkey"), false)
})
