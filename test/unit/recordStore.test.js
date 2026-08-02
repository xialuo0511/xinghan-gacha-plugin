import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { RecordStore } from "../../src/storage/recordStore.js"

const role = {
  game: "genshin",
  gameBiz: "hk4e_cn",
  uid: "123456789",
  region: "cn_gf01",
  lang: "zh-cn",
}

function record(id, extra = {}) {
  return {
    game: "genshin",
    gameBiz: role.gameBiz,
    uid: role.uid,
    id: String(id),
    gachaType: "301",
    count: "1",
    time: "2026-08-02 00:00:00",
    lang: "zh-cn",
    ...extra,
  }
}

test("atomically merges records without credentials or raw fields", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hoyo-record-test-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const store = new RecordStore({ directory })

  assert.deepEqual(await store.merge("user-a", role, [record(2), record(1)]), {
    added: 2,
    total: 2,
  })
  assert.deepEqual(
    await store.merge("user-a", role, [
      record(2),
      record(3, { raw: { authkey: "secret" }, stoken: "secret" }),
    ]),
    { added: 1, total: 3 },
  )
  assert.deepEqual(
    (await store.load("user-a", role)).map(value => value.id),
    ["3", "2", "1"],
  )
  assert.deepEqual(await store.load("user-b", role), [])
  const source = await readFile(store.file("user-a", role), "utf8")
  assert.equal(source.includes("authkey"), false)
  assert.equal(source.includes("stoken"), false)
  assert.equal(source.includes("secret"), false)
  assert.equal(JSON.parse(source).version, 2)
  assert.deepEqual(await store.listRoles("user-a"), [role])
})

test("claims an unscoped v1 file for only one bot user", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hoyo-record-legacy-test-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const store = new RecordStore({ directory })
  await writeFile(
    store.legacyFile(role),
    `${JSON.stringify({ version: 1, records: [record(1)] })}\n`,
    "utf8",
  )

  assert.equal((await store.load("user-a", role)).length, 1)
  assert.equal((await store.load("user-b", role)).length, 0)
})

test("serializes concurrent merges for the same user and role", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hoyo-record-concurrent-test-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const store = new RecordStore({ directory })

  await Promise.all([
    store.merge("user-a", role, [record(1)]),
    store.merge("user-a", role, [record(2)]),
  ])
  assert.deepEqual(
    (await store.load("user-a", role)).map(value => value.id),
    ["2", "1"],
  )
})
