import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMiaoCookie,
  logMiaoSyncFailure,
  miaoSyncMessage,
  syncCredentialToMiao,
} from "../../src/adapters/yunzai/miaoCredentialBridge.js"

const credential = Object.freeze({
  accountId: "10001",
  mid: "20002",
  stoken: "fixture-stoken",
  cookieToken: "fixture-cookie-token",
  roles: Object.freeze([
    Object.freeze({ game: "genshin", uid: "123456789" }),
    Object.freeze({ game: "starrail", uid: "100000001" }),
    Object.freeze({ game: "zzz", uid: "10000002" }),
  ]),
})

function bridgeFixture({ cacheError = false, currentUids = {}, saveWait, autoMainUids = {} } = {}) {
  const calls = []
  const mysUser = {
    setCkData(data) {
      calls.push(["setCkData", data])
    },
    addUid(uid, game) {
      calls.push(["addUid", uid, game])
    },
    async save() {
      calls.push(["mysSave"])
      if (saveWait) await saveWait()
    },
    async initCache() {
      calls.push(["initCache"])
      if (cacheError) throw new Error("fixture cache failure")
    },
  }
  const noteUser = {
    async addMysUser(value) {
      calls.push(["addMysUser", value])
      for (const [game, uid] of Object.entries(autoMainUids)) currentUids[game] ||= uid
    },
    async save() {
      calls.push(["noteSave"])
    },
    getUid(game) {
      return currentUids[game] ?? ""
    },
    getUidData(uid, game) {
      return currentUids[game] === uid && currentUids[`${game}Type`]
        ? {
            type: currentUids[`${game}Type`],
            ltuid: currentUids[`${game}Ltuid`],
          }
        : undefined
    },
    setMainUid(uid, game, save) {
      calls.push(["setMainUid", uid, game, save])
      currentUids[game] = uid
      currentUids[`${game}Type`] = "ck"
    },
  }
  const event = {
    user_id: "fixture-user",
    runtime: {
      MysUser: {
        async create(accountId) {
          calls.push(["createMysUser", accountId])
          return mysUser
        },
      },
      NoteUser: {
        async create(value) {
          calls.push(["createNoteUser", value])
          return noteUser
        },
      },
    },
  }
  return { calls, event, mysUser, noteUser }
}

test("builds a strict Cookie projection with stoken and cookie_token", () => {
  const cookie = buildMiaoCookie(credential)
  assert.equal(
    cookie,
    "stuid=10001;ltuid=10001;account_id=10001;mid=20002;stoken=fixture-stoken;cookie_token=fixture-cookie-token;",
  )
  assert.equal(cookie.includes("undefined"), false)
  assert.equal(cookie.includes("stoken_v2"), false)

  const v2Cookie = buildMiaoCookie({ ...credential, stokenName: "stoken_v2" })
  assert.match(v2Cookie, /(?:^|;)stoken_v2=fixture-stoken;/)
  assert.equal(v2Cookie.includes(";stoken=fixture-stoken;"), false)
})

test("rejects Cookie delimiter injection before touching Yunzai models", () => {
  assert.throws(
    () => buildMiaoCookie({ ...credential, stoken: "secret;admin=true" }),
    error => error.code === "MIAO_CREDENTIAL_INVALID",
  )
  assert.throws(
    () => buildMiaoCookie({ ...credential, accountId: "not-numeric" }),
    error => error.code === "MIAO_ACCOUNT_ID_UNSUPPORTED",
  )
})

test("uses the Yunzai MysUser and NoteUser models in the native binding flow", async () => {
  const { calls, event, mysUser } = bridgeFixture()
  const result = await syncCredentialToMiao(event, credential)

  assert.deepEqual(result, {
    status: "synced",
    cacheReady: true,
    games: ["gs", "sr", "zzz"],
  })
  assert.deepEqual(
    calls.map(call => call[0]),
    [
      "createMysUser",
      "createNoteUser",
      "setCkData",
      "addUid",
      "addUid",
      "addUid",
      "mysSave",
      "addMysUser",
      "setMainUid",
      "setMainUid",
      "setMainUid",
      "noteSave",
      "initCache",
    ],
  )
  assert.equal(calls.find(call => call[0] === "createNoteUser")[1], event)
  assert.equal(calls.find(call => call[0] === "addMysUser")[1], mysUser)
  assert.match(calls.find(call => call[0] === "setCkData")[1].ck, /cookie_token=/)
})

test("keeps another account's CK main UID but replaces an unrelated manual UID", async () => {
  const { calls, event } = bridgeFixture({
    currentUids: {
      gs: "987654321",
      gsType: "ck",
      gsLtuid: "90009",
      sr: "900000001",
      srType: "reg",
    },
  })
  await syncCredentialToMiao(event, credential)
  const switches = calls.filter(call => call[0] === "setMainUid")
  assert.deepEqual(switches, [
    ["setMainUid", "100000001", "sr", false],
    ["setMainUid", "10000002", "zzz", false],
  ])
})

test("switches to the selected UID when the current CK belongs to the same account", async () => {
  const { calls, event } = bridgeFixture({
    currentUids: {
      gs: "123456789",
      gsType: "ck",
      gsLtuid: "10001",
    },
  })
  await syncCredentialToMiao(event, {
    ...credential,
    roles: [
      { game: "genshin", uid: "123456789" },
      { game: "genshin", uid: "223456789" },
    ],
    selectedRoles: { genshin: "223456789" },
  })
  assert.deepEqual(calls.filter(call => call[0] === "setMainUid"), [
    ["setMainUid", "223456789", "gs", false],
  ])
})

test("stores every discovered UID and prefers the selected role for a new main UID", async () => {
  const { calls, event } = bridgeFixture({ autoMainUids: { gs: "123456789" } })
  await syncCredentialToMiao(event, {
    ...credential,
    roles: [
      { game: "genshin", uid: "123456789" },
      { game: "genshin", uid: "223456789" },
    ],
    selectedRoles: { genshin: "223456789" },
  })
  assert.deepEqual(calls.filter(call => call[0] === "addUid"), [
    ["addUid", "123456789", "gs"],
    ["addUid", "223456789", "gs"],
  ])
  assert.deepEqual(calls.filter(call => call[0] === "setMainUid"), [
    ["setMainUid", "223456789", "gs", false],
  ])
})

test("serializes bridge writes even when different HoYo accounts share a bot user", async () => {
  let releaseFirst
  let markFirstSave
  const firstSaveStarted = new Promise(resolve => {
    markFirstSave = resolve
  })
  const first = bridgeFixture({
    saveWait: async () => {
      markFirstSave()
      await new Promise(resolve => {
        releaseFirst = resolve
      })
    },
  })
  const second = bridgeFixture()
  const firstSync = syncCredentialToMiao(first.event, credential)
  await firstSaveStarted
  const secondSync = syncCredentialToMiao(second.event, {
    ...credential,
    accountId: "10002",
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(second.calls.some(call => call[0] === "createMysUser"), false)
  releaseFirst()
  await Promise.all([firstSync, secondSync])
  assert.equal(second.calls.some(call => call[0] === "createMysUser"), true)
})

test("reports missing models, legacy credentials, and cache refresh failure", async () => {
  assert.deepEqual(await syncCredentialToMiao({}, credential), { status: "unavailable" })
  const { event } = bridgeFixture()
  assert.deepEqual(await syncCredentialToMiao(event, { ...credential, cookieToken: undefined }), {
    status: "credential-incomplete",
  })

  const cacheFixture = bridgeFixture({ cacheError: true })
  const result = await syncCredentialToMiao(cacheFixture.event, credential)
  assert.equal(result.status, "synced")
  assert.equal(result.cacheReady, false)
  assert.match(miaoSyncMessage(result), /重启 TRSS-Yunzai/)
})

test("logs only a sanitized error code and type", () => {
  const messages = []
  globalThis.logger = { warn: message => messages.push(message) }
  try {
    const error = new Error("fixture-stoken fixture-cookie-token")
    error.code = "BAD CODE:fixture-stoken"
    logMiaoSyncFailure(error)
  } finally {
    delete globalThis.logger
  }
  assert.equal(messages.length, 1)
  assert.equal(messages[0].includes("fixture-cookie-token"), false)
  assert.equal(messages[0].includes("fixture-stoken"), false)
  assert.match(messages[0], /code=MIAO_SYNC_FAILED type=Error/)
})
