import assert from "node:assert/strict"
import test from "node:test"

import { AuthKeyClient } from "../../src/auth/authKeyClient.js"
import { GachaApiClient } from "../../src/gacha/gachaApiClient.js"

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status })
}

const credential = {
  accountId: "10001",
  mid: "20002",
  stoken: "fixture-stoken",
  device: { id: "A".repeat(32), name: "Android-test", model: "MTEST" },
}
const role = {
  game: "genshin",
  gameBiz: "hk4e_cn",
  uid: "123456789",
  region: "cn_gf01",
}

test("generates a Genshin authkey from role data with signed headers", async () => {
  const calls = []
  const client = new AuthKeyClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return response({ retcode: 0, data: { authkey: "fixture-authkey" } })
    },
    now: () => 1_700_000_000_000,
    random: () => "abc123",
  })
  assert.equal(await client.generate(credential, role), "fixture-authkey")
  const body = JSON.parse(calls[0].options.body)
  assert.deepEqual(body, {
    auth_appid: "webview_gacha",
    game_biz: "hk4e_cn",
    game_uid: 123456789,
    region: "cn_gf01",
  })
  assert.match(calls[0].options.headers.cookie, /stoken=fixture-stoken/)
  assert.match(calls[0].options.headers.ds, /^1700000000,abc123,[a-f0-9]{32}$/)
})

test("generates authkeys from Star Rail and ZZZ role metadata without hardcoded Genshin fields", async () => {
  const bodies = []
  const client = new AuthKeyClient({
    fetchImpl: async (_url, options) => {
      bodies.push(JSON.parse(options.body))
      return response({ retcode: 0, data: { authkey: "fixture-authkey" } })
    },
    now: () => 1_700_000_000_000,
    random: () => "abc123",
  })
  const roles = [
    { gameBiz: "hkrpg_cn", uid: "100000001", region: "prod_gf_cn" },
    { gameBiz: "nap_cn", uid: "10000002", region: "prod_gf_cn" },
  ]

  for (const gameRole of roles) await client.generate(credential, gameRole)

  assert.deepEqual(
    bodies.map(body => ({ game_biz: body.game_biz, game_uid: body.game_uid, region: body.region })),
    [
      { game_biz: "hkrpg_cn", game_uid: 100000001, region: "prod_gf_cn" },
      { game_biz: "nap_cn", game_uid: 10000002, region: "prod_gf_cn" },
    ],
  )
})

test("gacha GET carries neither Cookie nor DS and errors omit authkey", async () => {
  const calls = []
  const client = new GachaApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options })
      return response({ retcode: -101, message: "authkey error" })
    },
  })
  const pool = { queryType: "301", endpointKind: "standard" }
  const secret = "never-expose-authkey"
  await assert.rejects(
    () =>
      client.fetchPage({
        game: "genshin",
        market: "cn",
        auth: { authkey: secret, gameBiz: "hk4e_cn", region: "cn_gf01", lang: "zh-cn" },
        pool,
      }),
    error => error.code === "AUTHKEY_EXPIRED" && !error.message.includes(secret),
  )
  assert.equal("cookie" in (calls[0].options.headers ?? {}), false)
  assert.equal("ds" in (calls[0].options.headers ?? {}), false)
  assert.equal(calls[0].options.redirect, "error")
})
