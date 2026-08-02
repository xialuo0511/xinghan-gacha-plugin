import assert from "node:assert/strict"
import test from "node:test"

import { QrLoginClient } from "../../src/auth/qrLoginClient.js"
import { PROTOCOL_PROFILES } from "../../src/protocol/profiles.js"

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

test("creates and queries an app QR login with DS2 headers", async () => {
  const calls = []
  const responses = [
    {
      retcode: 0,
      data: {
        url: "https://user.mihoyo.com/login-platform/mobile.html?tk=fixture-ticket#/login/qr",
        ticket: "fixture-ticket",
      },
    },
    { retcode: 0, data: { status: "Scanned", tokens: [], user_info: null } },
  ]
  const client = new QrLoginClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return jsonResponse(responses.shift())
    },
    now: () => 1_700_000_000_000,
    random: () => 123456,
  })
  const device = { id: "A".repeat(32), name: "Android-test", model: "MTEST" }

  const created = await client.create({ device })
  const queried = await client.query({ device, ticket: created.ticket })

  assert.equal(created.ticket, "fixture-ticket")
  assert.equal(queried.state, "Scanned")
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.method, "POST")
  assert.equal(calls[0].options.body, "{}")
  assert.equal(calls[1].options.body, '{"ticket":"fixture-ticket"}')
  assert.equal(calls[0].options.headers["x-rpc-app_id"], "bll8iq97cem8")
  assert.match(calls[0].options.headers.ds, /^1700000000,123456,[a-f0-9]{32}$/)
  assert.equal(calls[0].options.redirect, "error")
})

test("extracts only the minimum confirmed credential fields", () => {
  const client = new QrLoginClient()
  const device = { id: "A".repeat(32), name: "Android-test", model: "MTEST" }
  const credential = client.extractCredential(
    {
      user_info: { aid: "10001", mid: "20002", email: "hidden@example.test" },
      tokens: [
        { name: "other", token: "ignore" },
        { name: "stoken_v2", token: "fixture-stoken" },
      ],
    },
    device,
  )
  assert.deepEqual(credential, {
    accountId: "10001",
    mid: "20002",
    stoken: "fixture-stoken",
    device,
  })
  assert.equal("email" in credential, false)
})

test("protocol profile records its source and smoke-test status", () => {
  const profile = PROTOCOL_PROFILES.communityCn
  assert.equal(profile.status, "observed-needs-live-smoke-test")
  assert.equal(profile.sourceRevision.length, 40)
  assert.equal(profile.qr.dsSalt.length > 0, true)
})
