import assert from "node:assert/strict"
import test from "node:test"

import { AuthKeyExpiredError, RateLimitError } from "../../src/gacha/errors.js"
import { GachaApiClient } from "../../src/gacha/gachaApiClient.js"
import { getGameAdapter } from "../../src/games/registry.js"

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => data,
  }
}

function auth(gameBiz, region) {
  return { authkey: "fixture-authkey", gameBiz, region, lang: "zh-cn" }
}

test("Star Rail routes standard and collaboration pools to separate primary methods", async () => {
  const calls = []
  const client = new GachaApiClient({
    fetchImpl: async input => {
      calls.push(new URL(input))
      return response({ retcode: 0, data: { list: [] } })
    },
  })
  const adapter = getGameAdapter("starrail")
  const context = auth("hkrpg_global", "prod_official_eur")

  await client.fetchPage({
    game: "starrail",
    market: "global",
    auth: context,
    pool: adapter.poolForQueryType("11"),
  })
  await client.fetchPage({
    game: "starrail",
    market: "global",
    auth: context,
    pool: adapter.poolForQueryType("21"),
  })

  assert.equal(calls[0].pathname.endsWith("/getGachaLog"), true)
  assert.equal(calls[0].pathname.includes("/hkrpg_gacha_record/"), true)
  assert.equal(calls[1].pathname.endsWith("/getLdGachaLog"), true)
  assert.equal(calls[1].pathname.includes("/hkrpg_gacha_record/"), true)
  assert.equal(calls[0].searchParams.get("gacha_type"), "11")
  assert.equal(calls[1].searchParams.get("gacha_type"), "21")
  assert.equal(calls[0].searchParams.get("region"), "prod_official_eur")
})

test("Star Rail performs exactly one trusted legacy-path fallback on HTTP 404", async () => {
  const calls = []
  const client = new GachaApiClient({
    fetchImpl: async input => {
      calls.push(new URL(input))
      return calls.length === 1
        ? response(undefined, 404)
        : response({ retcode: 0, data: { list: [] } })
    },
  })
  const pool = getGameAdapter("starrail").poolForQueryType("12")

  await client.fetchPage({
    game: "starrail",
    market: "cn",
    auth: auth("hkrpg_cn", "prod_gf_cn"),
    pool,
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].pathname.includes("/hkrpg_gacha_record/"), true)
  assert.equal(calls[1].pathname.includes("/common/gacha_record/"), true)
  assert.equal(calls.every(url => url.hostname === "public-operation-hkrpg.mihoyo.com"), true)
})

test("authkey rejection never triggers a Star Rail path fallback", async () => {
  let requests = 0
  const client = new GachaApiClient({
    fetchImpl: async () => {
      requests += 1
      return response({ retcode: -101, message: "authkey error", data: null })
    },
  })
  const pool = getGameAdapter("starrail").poolForQueryType("11")

  await assert.rejects(
    client.fetchPage({
      game: "starrail",
      market: "cn",
      auth: auth("hkrpg_cn", "prod_gf_cn"),
      pool,
    }),
    error => error instanceof AuthKeyExpiredError,
  )
  assert.equal(requests, 1)
})

test("rate limiting never triggers a Star Rail path fallback", async () => {
  let requests = 0
  const client = new GachaApiClient({
    fetchImpl: async () => {
      requests += 1
      return response({ retcode: -110, message: "visit too frequently", data: null })
    },
  })
  const pool = getGameAdapter("starrail").poolForQueryType("22")

  await assert.rejects(
    client.fetchPage({
      game: "starrail",
      market: "global",
      auth: auth("hkrpg_global", "prod_official_asia"),
      pool,
    }),
    error => error instanceof RateLimitError,
  )
  assert.equal(requests, 1)
})

test("ZZZ falls back only from nap to common and preserves long/short pool fields", async () => {
  const calls = []
  const client = new GachaApiClient({
    fetchImpl: async input => {
      calls.push(new URL(input))
      return calls.length === 1
        ? response(undefined, 405)
        : response({ retcode: 0, data: { list: [] } })
    },
  })
  const pool = getGameAdapter("zzz").poolForQueryType("102")

  await client.fetchPage({
    game: "zzz",
    market: "cn",
    auth: auth("nap_cn", "prod_gf_cn"),
    pool,
  })

  assert.deepEqual(
    calls.map(url => url.hostname),
    ["public-operation-nap.mihoyo.com", "public-operation-common.mihoyo.com"],
  )
  assert.equal(calls.length, 2)
  for (const url of calls) {
    assert.equal(url.pathname, "/common/gacha_record/api/getGachaLog")
    assert.equal(url.searchParams.get("real_gacha_type"), "102")
    assert.equal(url.searchParams.get("gacha_type"), "12001")
    assert.equal(url.searchParams.get("init_log_gacha_type"), "12001")
    assert.equal(url.searchParams.get("init_log_gacha_base_type"), "102")
  }
})
