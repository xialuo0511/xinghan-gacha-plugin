import assert from "node:assert/strict"
import test from "node:test"

import { RateLimitError } from "../../src/gacha/errors.js"
import { paginateGachaPool } from "../../src/gacha/paginator.js"

function item(id) {
  return { id: String(id) }
}

function normalize(value) {
  return { gameBiz: "hk4e_cn", uid: "123456789", id: String(value.id) }
}

test("uses the final id as end_id and stops at an existing record", async () => {
  const cursors = []
  const pages = [
    Array.from({ length: 20 }, (_, index) => item(40 - index)),
    Array.from({ length: 20 }, (_, index) => item(20 - index)),
  ]
  const result = await paginateGachaPool({
    fetchPage: async cursor => {
      cursors.push(cursor)
      return { list: pages.shift() }
    },
    normalize,
    hasRecord: record => record.id === "18",
    pageDelayMs: 0,
  })
  assert.deepEqual(cursors, ["0", "21"])
  assert.equal(result.records.length, 22)
  assert.equal(result.stopReason, "existing-record")
})

test("stops on an unchanged cursor", async () => {
  const result = await paginateGachaPool({
    fetchPage: async () => ({ list: Array.from({ length: 20 }, () => item(0)) }),
    normalize,
    pageDelayMs: 0,
  })
  assert.equal(result.stopReason, "unchanged-cursor")
})

test("retries rate limits with exponential backoff", async () => {
  let attempts = 0
  const delays = []
  const result = await paginateGachaPool({
    fetchPage: async () => {
      attempts += 1
      if (attempts < 3) throw new RateLimitError(-110)
      return { list: [item(1)] }
    },
    normalize,
    sleep: async delay => delays.push(delay),
    random: () => 0,
    pageDelayMs: 0,
  })
  assert.equal(result.records.length, 1)
  assert.deepEqual(delays, [1000, 2000])
})
