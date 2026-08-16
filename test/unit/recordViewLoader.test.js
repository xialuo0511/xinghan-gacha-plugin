import assert from "node:assert/strict"
import test from "node:test"

import { loadRecordViewWithTimeout } from "../../src/adapters/yunzai/recordViewLoader.js"

test("times out a record view load that never settles", { timeout: 1_000 }, async () => {
  const service = { get: () => new Promise(() => {}) }

  await assert.rejects(
    loadRecordViewWithTimeout(service, "user-a", "genshin", { timeoutMs: 5 }),
    error => error?.code === "RECORD_VIEW_TIMEOUT" && error?.causeName === "TimeoutError",
  )
})

test("discards a view that resolves after the load timeout", { timeout: 1_000 }, async () => {
  let resolveLoad
  const service = {
    get: () => new Promise(resolve => {
      resolveLoad = resolve
    }),
  }
  const loading = loadRecordViewWithTimeout(service, "user-a", "genshin", { timeoutMs: 5 })

  await assert.rejects(loading, error => error?.code === "RECORD_VIEW_TIMEOUT")
  resolveLoad({ game: "genshin", pools: [] })
  await new Promise(resolve => setImmediate(resolve))
})
