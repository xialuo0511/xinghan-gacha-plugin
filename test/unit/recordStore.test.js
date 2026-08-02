import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { RecordStore } from "../../src/storage/recordStore.js"

const role = { gameBiz: "hk4e_cn", uid: "123456789" }

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

  assert.deepEqual(await store.merge(role, [record(2), record(1)]), { added: 2, total: 2 })
  assert.deepEqual(
    await store.merge(role, [record(2), record(3, { raw: { authkey: "secret" }, stoken: "secret" })]),
    { added: 1, total: 3 },
  )
  assert.deepEqual(
    (await store.load(role)).map(value => value.id),
    ["3", "2", "1"],
  )
  const source = await readFile(store.file(role), "utf8")
  assert.equal(source.includes("authkey"), false)
  assert.equal(source.includes("stoken"), false)
  assert.equal(source.includes("secret"), false)
})
