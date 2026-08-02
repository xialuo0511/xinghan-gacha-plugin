import assert from "node:assert/strict"
import test from "node:test"

import { compareRecordIds, getGameAdapter } from "../../src/games/registry.js"

test("Genshin covers all planned pools and canonicalizes response type 400", () => {
  const adapter = getGameAdapter("genshin")
  assert.deepEqual(
    adapter.pools.map(pool => pool.queryType),
    ["100", "200", "301", "302", "500"],
  )
  assert.equal(adapter.poolForQueryType("400").queryType, "301")
})

test("Star Rail collaboration pools use the collaboration endpoint kind", () => {
  const adapter = getGameAdapter("starrail")
  assert.deepEqual(
    adapter.pools.map(pool => pool.queryType),
    ["1", "2", "11", "12", "21", "22"],
  )
  for (const type of ["1", "2", "11", "12"]) {
    assert.equal(adapter.poolForQueryType(type).endpointKind, "standard")
  }
  assert.equal(adapter.poolForQueryType("21").endpointKind, "collaboration")
  assert.equal(adapter.poolForQueryType("22").endpointKind, "collaboration")
  assert.equal(adapter.markets.global.regions.includes("prod_official_eur"), true)
  assert.equal(adapter.markets.global.regions.includes("prod_official_euro"), false)
})

test("ZZZ maps short and long pool types", () => {
  const adapter = getGameAdapter("zzz")
  const cases = {
    1: "1001",
    2: "2001",
    3: "3001",
    5: "5001",
    102: "12001",
    103: "13001",
  }
  for (const [shortType, longType] of Object.entries(cases)) {
    assert.equal(adapter.poolForQueryType(shortType).longType, longType)
    assert.equal(adapter.poolForQueryType(longType).queryType, shortType)
    const query = adapter.buildQuery(
      {
        authkey: "fixture-token",
        gameBiz: "nap_cn",
        region: "prod_gf_cn",
        lang: "zh-cn",
      },
      shortType,
      "0",
    )
    assert.equal(query.get("real_gacha_type"), shortType)
    assert.equal(query.get("gacha_type"), longType)
    assert.equal(query.get("init_log_gacha_type"), longType)
    assert.equal(query.get("init_log_gacha_base_type"), shortType)
  }
})

test("buildQuery uses end_id and preserves record ids as strings", () => {
  const adapter = getGameAdapter("genshin")
  const query = adapter.buildQuery(
    {
      authkey: "fixture-token",
      gameBiz: "hk4e_cn",
      region: "cn_gf01",
      lang: "zh-cn",
    },
    "500",
    "9223372036854775808",
  )
  assert.equal(query.get("end_id"), "9223372036854775808")
  assert.equal(query.has("page"), false)
  assert.equal(query.get("size"), "20")

  const record = adapter.normalize(
    {
      id: 9223372036854775808n,
      gacha_type: "500",
      time: "2026-08-02 00:00:00",
    },
    { uid: "123456789", region: "cn_gf01" },
  )
  assert.equal(record.id, "9223372036854775808")
  assert.equal(compareRecordIds(record.id, "9223372036854775807"), 1)
})

test("normalization rejects non-numeric record ids", () => {
  const adapter = getGameAdapter("genshin")
  assert.throws(
    () =>
      adapter.normalize(
        { id: "not-a-number", gacha_type: "301", time: "2026-08-02 00:00:00" },
        { uid: "123456789", region: "cn_gf01" },
      ),
    /digits only/,
  )
})
