import assert from "node:assert/strict"
import test from "node:test"

import { RecordViewService } from "../../src/view/recordViewService.js"

const roles = Object.freeze({
  genshin: Object.freeze({
    game: "genshin",
    gameBiz: "hk4e_cn",
    uid: "123456789",
    region: "cn_gf01",
    regionName: "天空岛",
  }),
  starrail: Object.freeze({
    game: "starrail",
    gameBiz: "hkrpg_cn",
    uid: "100000001",
    region: "prod_gf_cn",
    regionName: "星穹列车",
  }),
  zzz: Object.freeze({
    game: "zzz",
    gameBiz: "nap_cn",
    uid: "10000002",
    region: "prod_gf_cn",
    regionName: "新艾利都",
  }),
})

function record(role, id, name, rankType, gachaType, extra = {}) {
  return {
    game: role.game,
    gameBiz: role.gameBiz,
    uid: role.uid,
    id: String(id),
    name,
    itemType: role.game === "zzz" ? "代理人" : "角色",
    rankType: String(rankType),
    gachaType: String(gachaType),
    time: `2026-08-02 00:00:0${id}`,
    ...extra,
  }
}

function recordsFor(role) {
  const config = {
    genshin: { high: "5", pool: "301", off: "迪卢克", up: "胡桃" },
    starrail: { high: "5", pool: "11", off: "布洛妮娅", up: "流萤" },
    zzz: { high: "4", pool: "2", off: "莱卡恩", up: "艾莲" },
  }[role.game]
  return [
    record(role, 5, config.up, config.high, config.pool),
    record(role, 4, "普通物品", "3", config.pool),
    record(role, 3, config.off, config.high, config.pool),
    record(role, 2, "普通物品", "3", config.pool),
    record(role, 1, "普通物品", "3", config.pool),
  ]
}

function service(overrides = {}) {
  const credential = {
    roles: Object.values(roles),
    selectedRoles: Object.fromEntries(Object.values(roles).map(role => [role.game, role.uid])),
  }
  return new RecordViewService({
    credentialStore: overrides.credentialStore ?? { load: async () => credential },
    recordStore:
      overrides.recordStore ??
      ({
        listRoles: async () => Object.values(roles),
        load: async (_userId, role) => recordsFor(role),
      }),
    now: () => new Date("2026-08-02T12:00:00.000Z"),
  })
}

for (const game of ["genshin", "starrail", "zzz"]) {
  test(`builds ${game} pool, pity, luck, UP and off-banner presentation`, async () => {
    const view = await service().get("user-a", game)
    assert.equal(view.game, game)
    assert.equal(view.summary.total, 5)
    assert.equal(view.summary.highCount, 2)
    assert.equal(view.summary.upCount, 1)
    assert.equal(view.summary.offCount, 1)
    assert.equal(view.summary.averageHighPity, 2.5)
    assert.equal(view.luck.label, "欧皇")
    assert.deepEqual(
      view.highlights.map(item => [item.name, item.status.label, item.pulls]),
      [
        [game === "genshin" ? "胡桃" : game === "starrail" ? "流萤" : "艾莲", "UP", 2],
        [game === "genshin" ? "迪卢克" : game === "starrail" ? "布洛妮娅" : "莱卡恩", "歪", 3],
      ],
    )
    assert.equal(view.recent.length, 5)
    assert.equal(view.generatedAt, "2026-08-02T12:00:00.000Z")
  })
}

test("an explicit isUp field takes precedence over the standard character catalog", async () => {
  const role = roles.genshin
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => [record(role, 1, "迪卢克", "5", "301", { isUp: "true" })],
    },
  })
  const view = await custom.get("user-a", "genshin")
  assert.equal(view.highlights[0].status.label, "UP")
  assert.equal(view.highlights[0].status.source, "record")
})

test("requires a selected role when multiple stored roles exist", async () => {
  const second = { ...roles.genshin, uid: "223456789" }
  const custom = service({
    credentialStore: { load: async () => undefined },
    recordStore: {
      listRoles: async () => [roles.genshin, second],
      load: async () => [],
    },
  })
  await assert.rejects(custom.get("user-a", "genshin"), error => error?.code === "ROLE_REQUIRED")
})

test("reports an empty selected role as NO_GACHA_RECORDS", async () => {
  const custom = service({
    recordStore: {
      listRoles: async () => [roles.genshin],
      load: async () => [],
    },
  })
  await assert.rejects(
    custom.get("user-a", "genshin"),
    error => error?.code === "NO_GACHA_RECORDS",
  )
})
