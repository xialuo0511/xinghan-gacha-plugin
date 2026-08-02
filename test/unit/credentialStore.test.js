import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { CredentialStore } from "../../src/storage/credentialStore.js"

const fixture = {
  accountId: "10001",
  mid: "20002",
  stoken: "fixture-stoken-secret",
  device: { id: "A".repeat(32), name: "Android-test", model: "MTEST" },
  roles: [],
  selectedRoles: {},
}

test("persists credentials only as AES-256-GCM ciphertext", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hoyo-credential-test-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const key = Buffer.alloc(32, 7)
  const store = new CredentialStore({ directory, masterKey: key })

  const result = await store.save("user-a", fixture)
  assert.equal(result.persistence, "encrypted-file")
  const source = await readFile(store.file("user-a"), "utf8")
  assert.equal(source.includes(fixture.stoken), false)
  assert.equal(JSON.parse(source).algorithm, "aes-256-gcm")

  const reloaded = new CredentialStore({ directory, masterKey: key })
  assert.deepEqual(await reloaded.load("user-a"), fixture)
})

test("without a master key credentials remain memory-only", async () => {
  const store = new CredentialStore()
  assert.equal(store.persistent, false)
  assert.equal((await store.save("user-b", fixture)).persistence, "memory")
  assert.deepEqual(await store.load("user-b"), fixture)
})

test("wrong keys fail without exposing plaintext", async context => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hoyo-credential-test-"))
  context.after(() => rm(directory, { recursive: true, force: true }))
  await new CredentialStore({ directory, masterKey: Buffer.alloc(32, 1) }).save("user-c", fixture)
  const wrong = new CredentialStore({ directory, masterKey: Buffer.alloc(32, 2) })
  await assert.rejects(
    () => wrong.load("user-c"),
    error => error.message === "Credential decryption failed" && !error.message.includes(fixture.stoken),
  )
})
