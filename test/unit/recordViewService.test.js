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

function displayedItems(view) {
  return view.pools.flatMap(pool => pool.items)
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
      displayedItems(view).map(item => [item.name, item.status.label, item.pulls]),
      [
        [game === "genshin" ? "胡桃" : game === "starrail" ? "流萤" : "艾莲", "UP", 2],
        [game === "genshin" ? "迪卢克" : game === "starrail" ? "布洛妮娅" : "莱卡恩", "歪", 3],
      ],
    )
    assert.equal(displayedItems(view).every(item => item.pullLuck.label === "欧皇"), true)
    const activePool = view.pools.find(pool => pool.total > 0)
    assert.equal(activePool.displayedHighCount, 2)
    assert.equal(activePool.hiddenHighCount, 0)
    assert.equal(activePool.averageHighPity, 2.5)
    assert.equal(activePool.bestHighPity, 2)
    assert.equal(activePool.worstHighPity, 3)
    assert.deepEqual(activePool.dateRange, {
      from: "2026-08-02 00:00:01",
      to: "2026-08-02 00:00:05",
    })
    assert.equal("recent" in view, false)
    assert.equal("highlights" in view, false)
    assert.equal("middleCount" in view.summary, false)
    assert.equal(view.generatedAt, "2026-08-02T12:00:00.000Z")
  })
}

test("classifies every high-rarity result by its pool-specific pull count", async () => {
  const role = roles.genshin
  const highAt = new Set([20, 70, 140, 220, 310])
  const source = Array.from({ length: 310 }, (_, index) => {
    const id = index + 1
    return record(role, id, `Item ${id}`, highAt.has(id) ? "5" : "3", "301")
  })
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => source,
    },
  })

  const view = await custom.get("user-a", "genshin")
  assert.deepEqual(
    [...displayedItems(view)].reverse().map(item => [item.pulls, item.pullLuck.label, item.pullLuck.tone]),
    [
      [20, "欧皇", "lucky"],
      [50, "小欧", "good"],
      [70, "常态", "steady"],
      [80, "偏非", "warning"],
      [90, "大保底", "hard"],
    ],
  )
})

test("uses the 50-pull cap for Star Rail Departure Warp", async () => {
  const role = roles.starrail
  const source = Array.from({ length: 50 }, (_, index) => {
    const id = index + 1
    return record(role, id, id === 50 ? "姬子" : `Item ${id}`, id === 50 ? "5" : "3", "2")
  })
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => source,
    },
  })

  const view = await custom.get("user-a", "starrail")
  const departurePool = view.pools.find(pool => pool.queryType === "2")
  assert.equal(departurePool.pityCap, 50)
  assert.equal(departurePool.pityMode, "consumed")
  assert.equal(departurePool.currentPity, undefined)
  assert.equal(departurePool.pityPercent, undefined)
  assert.equal(departurePool.guaranteePulls, 50)
  assert.equal(departurePool.items[0].pulls, 50)
  assert.equal(departurePool.items[0].pullPrefix, "第")
  assert.deepEqual(departurePool.items[0].pullLuck, { label: "大保底", tone: "hard" })
  assert.equal(view.luck.tone, "hard")
})

test("treats Departure Warp as one finite guarantee and extra five-stars as bonuses", async () => {
  const role = roles.starrail
  const source = Array.from({ length: 50 }, (_, index) => {
    const id = index + 1
    const high = id === 10 || id === 30
    return record(role, id, high ? `五星 ${id}` : `Item ${id}`, high ? "5" : "3", "2")
  })
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => source,
    },
  })

  const view = await custom.get("user-a", "starrail")
  const departurePool = view.pools.find(pool => pool.queryType === "2")
  assert.equal(departurePool.pityMode, "consumed")
  assert.equal(departurePool.currentPity, undefined)
  assert.equal(departurePool.guaranteePulls, 10)
  assert.equal(departurePool.extraHighCount, 1)
  assert.equal(departurePool.pityPercent, undefined)
  assert.deepEqual(
    departurePool.items.map(item => [item.pulls, item.pullPrefix, item.pullLuck.label, item.departureResult]),
    [
      [30, "第", "额外金", "bonus"],
      [10, "第", "欧皇", "guarantee"],
    ],
  )
  assert.equal(view.summary.averageHighPity, 10)
  assert.equal(view.luck.tone, "lucky")
})

test("shows finite Departure progress only until its first five-star", async () => {
  const role = roles.starrail
  const source = Array.from({ length: 40 }, (_, index) =>
    record(role, index + 1, `Item ${index + 1}`, "3", "2"),
  )
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => source,
    },
  })

  const view = await custom.get("user-a", "starrail")
  const departurePool = view.pools.find(pool => pool.queryType === "2")
  assert.equal(departurePool.pityMode, "finite")
  assert.equal(departurePool.currentPity, 40)
  assert.equal(departurePool.pityPercent, 80)
  assert.equal(departurePool.guaranteePulls, undefined)
  assert.equal(view.luck.tone, "unknown")
})

test("normalizes mixed-pool luck by each pool cap at every color boundary", async () => {
  const role = roles.genshin
  const cases = [
    {
      label: "lucky to good",
      characterPulls: 32,
      weaponPulls: 28,
      expectedItemTones: ["good", "lucky"],
      expectedGlobalTone: "good",
      expectedRawAverage: 30,
    },
    {
      label: "good to steady",
      characterPulls: 55,
      weaponPulls: 48,
      expectedItemTones: ["steady", "good"],
      expectedGlobalTone: "steady",
      expectedRawAverage: 51.5,
    },
    {
      label: "steady to warning",
      characterPulls: 73,
      weaponPulls: 64,
      expectedItemTones: ["warning", "steady"],
      expectedGlobalTone: "warning",
      expectedRawAverage: 68.5,
    },
    {
      label: "hard pity",
      characterPulls: 90,
      weaponPulls: 80,
      expectedItemTones: ["hard", "hard"],
      expectedGlobalTone: "hard",
      expectedRawAverage: 85,
    },
  ]

  for (const scenario of cases) {
    const characterRecords = Array.from({ length: scenario.characterPulls }, (_, index) => {
      const id = index + 1
      return record(
        role,
        id,
        id === scenario.characterPulls ? "胡桃" : `Character item ${id}`,
        id === scenario.characterPulls ? "5" : "3",
        "301",
      )
    })
    const weaponRecords = Array.from({ length: scenario.weaponPulls }, (_, index) => {
      const id = scenario.characterPulls + index + 1
      return record(
        role,
        id,
        index === scenario.weaponPulls - 1 ? "雾切之回光" : `Weapon item ${id}`,
        index === scenario.weaponPulls - 1 ? "5" : "3",
        "302",
        { itemType: "武器" },
      )
    })
    const custom = service({
      recordStore: {
        listRoles: async () => [role],
        load: async () => [...characterRecords, ...weaponRecords],
      },
    })

    const view = await custom.get("user-a", "genshin")
    const characterItem = view.pools.find(pool => pool.queryType === "301").items[0]
    const weaponItem = view.pools.find(pool => pool.queryType === "302").items[0]
    assert.deepEqual(
      [characterItem.pullLuck.tone, weaponItem.pullLuck.tone],
      scenario.expectedItemTones,
      scenario.label,
    )
    assert.equal(view.summary.averageHighPity, scenario.expectedRawAverage, scenario.label)
    assert.equal(view.luck.tone, scenario.expectedGlobalTone, scenario.label)
  }
})

test("an explicit isUp field takes precedence over the standard character catalog", async () => {
  const role = roles.genshin
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => [record(role, 1, "迪卢克", "5", "301", { isUp: "true" })],
    },
  })
  const view = await custom.get("user-a", "genshin")
  assert.equal(displayedItems(view)[0].status.label, "UP")
  assert.equal(displayedItems(view)[0].status.source, "record")
})

test("keeps high-rarity items in their own pools with item metadata", async () => {
  const role = roles.genshin
  const source = [
    record(role, 4, "雾切之回光", "5", "302", {
      itemId: "11409",
      itemType: "武器",
    }),
    record(role, 3, "普通武器", "3", "302", { itemType: "武器" }),
    record(role, 2, "胡桃", "5", "301", { itemId: "10000046", itemType: "角色" }),
    record(role, 1, "普通物品", "3", "301"),
  ]
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => source,
    },
  })

  const view = await custom.get("user-a", "genshin")
  const characterPool = view.pools.find(pool => pool.queryType === "301")
  const weaponPool = view.pools.find(pool => pool.queryType === "302")
  assert.deepEqual(characterPool.items.map(item => item.name), ["胡桃"])
  assert.deepEqual(weaponPool.items.map(item => item.name), ["雾切之回光"])
  assert.equal(characterPool.items[0].itemId, "10000046")
  assert.equal(characterPool.items[0].itemKind, "character")
  assert.equal(weaponPool.items[0].itemId, "11409")
  assert.equal(weaponPool.items[0].itemKind, "weapon")
  assert.equal(weaponPool.items[0].status, undefined)
})

test("limits the whole image to the latest twelve high-rarity items and reports hidden counts", async () => {
  const role = roles.genshin
  const source = Array.from({ length: 16 }, (_, index) =>
    record(role, index + 1, `五星 ${index + 1}`, "5", index % 2 === 0 ? "301" : "302", {
      itemType: index % 2 === 0 ? "角色" : "武器",
    }),
  )
  const custom = service({
    recordStore: {
      listRoles: async () => [role],
      load: async () => source,
    },
  })

  const view = await custom.get("user-a", "genshin")
  assert.equal(displayedItems(view).length, 12)
  assert.equal(view.pools.reduce((sum, pool) => sum + pool.hiddenHighCount, 0), 4)
  assert.deepEqual(
    displayedItems(view)
      .map(item => Number(item.id))
      .sort((a, b) => a - b),
    [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  )
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
