import assert from "node:assert/strict"
import test from "node:test"

import { CredentialExchangeClient } from "../../src/auth/credentialExchange.js"
import { RoleDiscoveryClient } from "../../src/auth/roleDiscovery.js"

function response(payload) {
  return new Response(JSON.stringify(payload), { status: 200 })
}

const credential = {
  accountId: "10001",
  mid: "20002",
  stoken: "fixture-stoken",
  device: { id: "A".repeat(32), name: "Android-test", model: "MTEST" },
}

test("exchanges stoken without putting credentials in an error", async () => {
  const calls = []
  const client = new CredentialExchangeClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options })
      return response({ retcode: 0, data: { uid: "10001", cookie_token: "fixture-cookie-token" } })
    },
  })
  assert.equal(await client.getCookieToken(credential), "fixture-cookie-token")
  assert.equal(calls[0].url.searchParams.get("stoken"), "fixture-stoken")
  assert.match(calls[0].options.headers.cookie, /stoken=fixture-stoken/)
})

test("discovers and normalizes roles for all three CN games", async () => {
  const rolesByBiz = {
    hk4e_cn: { game_uid: "123456789", region: "cn_gf01", region_name: "天空岛" },
    hkrpg_cn: { game_uid: "100000001", region: "prod_gf_cn", region_name: "星穹列车" },
    nap_cn: { game_uid: "10000002", region: "prod_gf_cn", region_name: "新艾利都" },
  }
  const client = new RoleDiscoveryClient({
    fetchImpl: async url => {
      const role = rolesByBiz[new URL(url).searchParams.get("game_biz")]
      return response({ retcode: 0, data: { list: [{ ...role, nickname: "fixture", level: 60 }] } })
    },
    now: () => 1_700_000_000_000,
    random: () => "abc123",
  })
  const result = await client.discover(credential, "fixture-cookie-token")

  assert.equal(result.roles.length, 3)
  assert.deepEqual(
    result.roles.map(role => role.game),
    ["genshin", "starrail", "zzz"],
  )
  assert.equal(result.errors.length, 0)
  assert.equal(result.roles[0].gameBiz, "hk4e_cn")
})

test("one role endpoint failure does not discard other games", async () => {
  const client = new RoleDiscoveryClient({
    fetchImpl: async url => {
      const biz = new URL(url).searchParams.get("game_biz")
      if (biz === "hkrpg_cn") return response({ retcode: -1, message: "fixture failure" })
      const region = biz === "hk4e_cn" ? "cn_gf01" : "prod_gf_cn"
      return response({ retcode: 0, data: { list: [{ game_uid: "1", region }] } })
    },
  })
  const result = await client.discover(credential, "fixture-cookie-token")
  assert.equal(result.roles.length, 2)
  assert.deepEqual(result.errors.map(error => error.game), ["starrail"])
})
