import assert from "node:assert/strict"
import test from "node:test"

import { createDs, createDs2 } from "../../src/protocol/signatures.js"

test("DS2 includes the exact JSON body and query", () => {
  const value = createDs2({
    salt: "fixture-salt",
    body: '{"ticket":"fixture"}',
    query: "a=1",
    now: () => 1_700_000_000_000,
    random: () => 123456,
  })
  assert.equal(value, "1700000000,123456,deab3e795259aaf04ec74340e9a79700")
})

test("DS is deterministic with injected clock and nonce", () => {
  const value = createDs({
    salt: "fixture-salt",
    now: () => 1_700_000_000_000,
    random: () => "abc123",
  })
  assert.equal(value, "1700000000,abc123,c09d1219342caee81dad7cf50cd552a0")
})
