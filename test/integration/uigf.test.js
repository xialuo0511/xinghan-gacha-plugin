import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { CredentialStore } from "../../src/storage/credentialStore.js"
import { RecordStore } from "../../src/storage/recordStore.js"
import { UigfService } from "../../src/export/uigfService.js"

const roles = [
  { game: "genshin", gameBiz: "hk4e_cn", uid: "123456789", region: "cn_gf01" },
  { game: "starrail", gameBiz: "hkrpg_cn", uid: "100000001", region: "prod_gf_cn" },
  { game: "zzz", gameBiz: "nap_global", uid: "10000002", region: "prod_gf_jp" },
]

function record(role, id, gachaType) {
  return {
    game: role.game,
    gameBiz: role.gameBiz,
    uid: role.uid,
    id: String(id),
    gachaType: String(gachaType),
    gachaId: "fixture-gacha-id",
    itemId: "fixture-item-id",
    name: "fixture",
    itemType: "角色",
    rankType: "5",
    count: "1",
    time: "2026-08-02 00:00:00",
    lang: "zh-cn",
  }
}

async function fixture(context, prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const credentialStore = new CredentialStore()
  const recordStore = new RecordStore({ directory })
  const service = new UigfService({
    credentialStore,
    recordStore,
    appVersion: "0.1.0-test",
    now: () => 1_775_000_000_000,
  })
  return { credentialStore, recordStore, service }
}

test("exports UIGF v4.1 for three games without credentials", async context => {
  const { credentialStore, recordStore, service } = await fixture(context, "xinghan-uigf-export-")
  await credentialStore.save("user-a", {
    stoken: "never-export-this-stoken",
    cookie: "never-export-this-cookie",
    roles,
  })
  await recordStore.merge("user-a", roles[0], [record(roles[0], 3010001, "301")])
  await recordStore.merge("user-a", roles[1], [record(roles[1], 110001, "11")])
  await recordStore.merge("user-a", roles[2], [record(roles[2], 102001, "102")])

  const result = await service.export("user-a")
  assert.equal(result.data.info.version, "v4.1")
  assert.equal(result.accounts, 3)
  assert.equal(result.records, 3)
  assert.deepEqual(
    [result.data.hk4e.length, result.data.hkrpg.length, result.data.nap.length],
    [1, 1, 1],
  )
  assert.equal(result.data.nap[0].timezone, 9)
  assert.equal(result.data.nap[0].list[0].gacha_type, "2")
  assert.equal(result.json.includes("stoken"), false)
  assert.equal(result.json.includes("cookie"), false)
  assert.equal(result.json.includes("authkey"), false)
})

test("imports UIGF repeatedly without duplicates and isolates bot users", async context => {
  const source = await fixture(context, "xinghan-uigf-source-")
  await source.credentialStore.save("source-user", { roles })
  await source.recordStore.merge("source-user", roles[0], [record(roles[0], 3010001, "301")])
  await source.recordStore.merge("source-user", roles[1], [record(roles[1], 110001, "11")])
  await source.recordStore.merge("source-user", roles[2], [record(roles[2], 102001, "102")])
  const exported = await source.service.export("source-user")

  const target = await fixture(context, "xinghan-uigf-target-")
  await target.credentialStore.save("user-a", { roles })
  await target.credentialStore.save("user-b", { roles })
  const duplicated = structuredClone(exported.data)
  duplicated.hk4e.push(structuredClone(duplicated.hk4e[0]))
  const first = await target.service.import("user-a", duplicated)
  const second = await target.service.import("user-a", duplicated)

  assert.deepEqual(first, { accounts: 3, added: 3, total: 3 })
  assert.deepEqual(second, { accounts: 3, added: 0, total: 3 })
  assert.equal((await target.recordStore.load("user-a", roles[0])).length, 1)
  assert.equal((await target.recordStore.load("user-b", roles[0])).length, 0)
})

test("imports legacy UIGF but rejects an unbound UID before writing", async context => {
  const { credentialStore, recordStore, service } = await fixture(context, "xinghan-uigf-legacy-")
  await credentialStore.save("user-a", { roles: [roles[0]] })
  const legacy = {
    info: { uid: roles[0].uid, lang: "zh-cn", uigf_version: "v3.0" },
    list: [
      {
        id: "3010001",
        uigf_gacha_type: "301",
        gacha_type: "301",
        item_id: "fixture-item-id",
        time: "2026-08-02 00:00:00",
      },
    ],
  }
  assert.deepEqual(await service.import("user-a", legacy), { accounts: 1, added: 1, total: 1 })

  const unknown = structuredClone(legacy)
  unknown.info.uid = "999999999"
  await assert.rejects(service.import("user-a", unknown), { code: "IMPORT_ROLE_REQUIRED" })
  assert.equal((await recordStore.load("user-a", roles[0])).length, 1)
})

test("imports legacy SRGF v1 through its separate format marker", async context => {
  const { credentialStore, recordStore, service } = await fixture(context, "xinghan-srgf-legacy-")
  await credentialStore.save("user-a", { roles: [roles[1]] })
  const legacy = {
    info: { uid: roles[1].uid, lang: "zh-cn", srgf_version: "v1.0" },
    list: [
      {
        id: "110001",
        gacha_type: "11",
        gacha_id: "fixture-gacha-id",
        item_id: "fixture-item-id",
        time: "2026-08-02 00:00:00",
      },
    ],
  }
  assert.deepEqual(await service.import("user-a", legacy), { accounts: 1, added: 1, total: 1 })
  assert.equal((await recordStore.load("user-a", roles[1]))[0].gachaType, "11")
})
