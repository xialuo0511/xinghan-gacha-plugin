import assert from "node:assert/strict"
import test from "node:test"

import { checkedRecordReply } from "../../src/adapters/yunzai/recordReply.js"

test("accepts successful reply values including undefined", async () => {
  assert.equal(await checkedRecordReply(async () => undefined, "message"), undefined)
  assert.deepEqual(
    await checkedRecordReply(async () => ({ message_id: "fixture" }), "message"),
    { message_id: "fixture" },
  )
})

test("retries one explicit adapter error with bounded backoff", async () => {
  const sleeps = []
  let calls = 0
  const result = await checkedRecordReply(
    async () => {
      calls += 1
      return calls === 1 ? { error: "rate limited" } : { message_id: "sent" }
    },
    "image",
    { sleep: async delay => sleeps.push(delay) },
  )

  assert.deepEqual(result, { message_id: "sent" })
  assert.equal(calls, 2)
  assert.deepEqual(sleeps, [750])
})

test("rejects false or error results after one retry", async () => {
  let calls = 0
  await assert.rejects(
    checkedRecordReply(
      async () => {
        calls += 1
        return false
      },
      "image",
      { retryDelayMs: 0 },
    ),
    error => error?.code === "RENDER_MESSAGE_UNAVAILABLE",
  )
  assert.equal(calls, 2)
})

test("times out a pending reply without retrying a possibly late send", async () => {
  let calls = 0
  await assert.rejects(
    checkedRecordReply(
      async () => {
        calls += 1
        return new Promise(() => {})
      },
      "image",
      { timeoutMs: 5, retryDelayMs: 0 },
    ),
    error => error?.code === "RENDER_MESSAGE_UNAVAILABLE",
  )
  assert.equal(calls, 1)
})
