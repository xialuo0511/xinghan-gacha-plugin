import assert from "node:assert/strict"
import test from "node:test"

import { RecordBatchCursorStore } from "../../src/adapters/yunzai/recordBatchCursorStore.js"

function value(pageIndex, skipAssetResolution = false) {
  return {
    signature: `signature-${pageIndex}`,
    cursor: { positions: [pageIndex * 24], poolCursor: 0, pageIndex },
    skipAssetResolution,
  }
}

test("stores immutable continuation state and expires it", () => {
  let now = 1_000
  const store = new RecordBatchCursorStore({ ttlMs: 100, now: () => now })
  const original = value(8, true)
  store.set(" user:game ", original)
  original.cursor.positions[0] = 0

  const saved = store.get("user:game")
  assert.equal(saved.signature, "signature-8")
  assert.deepEqual(saved.cursor.positions, [192])
  assert.equal(saved.skipAssetResolution, true)
  assert.ok(Object.isFrozen(saved.cursor.positions))

  now = 1_100
  assert.equal(store.get("user:game"), undefined)
})

test("evicts the oldest continuation when capacity is reached", () => {
  const store = new RecordBatchCursorStore({ maxEntries: 2 })
  store.set("first", value(1))
  store.set("second", value(2))
  store.set("third", value(3))

  assert.equal(store.get("first"), undefined)
  assert.equal(store.get("second").cursor.pageIndex, 2)
  assert.equal(store.get("third").cursor.pageIndex, 3)
  assert.equal(store.delete("second"), true)
  assert.equal(store.get("second"), undefined)
})
