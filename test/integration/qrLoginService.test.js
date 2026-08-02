import assert from "node:assert/strict"
import test from "node:test"

import { QrLoginService } from "../../src/auth/qrLoginService.js"
import { MemoryQrSessionStore } from "../../src/auth/qrSessionStore.js"

function serviceFixture(states) {
  const sessionStore = new MemoryQrSessionStore()
  const saved = new Map()
  const device = { id: "A".repeat(32), name: "Android-test", model: "MTEST" }
  const service = new QrLoginService({
    client: {
      createDevice: () => device,
      create: async () => ({ url: "https://user.mihoyo.com/qr", ticket: "fixture-ticket" }),
      query: async () => {
        const state = states.shift()
        return state === "Confirmed"
          ? { state, data: { fixture: true } }
          : { state }
      },
      extractCredential: () => ({
        accountId: "10001",
        mid: "20002",
        stoken: "fixture-stoken",
        device,
      }),
    },
    sessionStore,
    credentialExchange: { getCookieToken: async () => "fixture-cookie-token" },
    roleDiscovery: {
      discover: async () => ({
        roles: [
          {
            game: "genshin",
            uid: "123456789",
            gameBiz: "hk4e_cn",
            region: "cn_gf01",
          },
        ],
        errors: [],
      }),
    },
    credentialStore: {
      save: async (userId, credential) => {
        saved.set(userId, credential)
        return { persistence: "encrypted-file" }
      },
    },
    pollIntervalMs: 0,
  })
  return { service, sessionStore, saved }
}

test("runs Created to Scanned to Confirmed and clears the mutex", async () => {
  const { service, sessionStore, saved } = serviceFixture(["Created", "Scanned", "Confirmed"])
  const statuses = []
  await service.start("user-a")
  await assert.rejects(() => service.start("user-a"), error => error.code === "QR_SESSION_EXISTS")
  const result = await service.poll("user-a", { onStatus: status => statuses.push(status.state) })

  assert.equal(result.state, "Confirmed")
  assert.deepEqual(statuses, ["Scanned", "Confirmed"])
  assert.equal(saved.get("user-a").selectedRoles.genshin, "123456789")
  assert.equal(await sessionStore.get("user-a"), undefined)
})

test("expired and cancelled sessions are always cleared", async () => {
  for (const state of ["Expired", "Cancelled"]) {
    const { service, sessionStore } = serviceFixture([state])
    await service.start(`user-${state}`)
    assert.equal((await service.poll(`user-${state}`)).state, state)
    assert.equal(await sessionStore.get(`user-${state}`), undefined)
  }
})

test("network errors clear the session", async () => {
  const { service, sessionStore } = serviceFixture([])
  service.client.query = async () => {
    const error = new Error("safe failure")
    error.code = "NETWORK_ERROR"
    throw error
  }
  await service.start("user-network")
  await assert.rejects(() => service.poll("user-network"), error => error.code === "NETWORK_ERROR")
  assert.equal(await sessionStore.get("user-network"), undefined)
})
