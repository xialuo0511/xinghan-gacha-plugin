import assert from "node:assert/strict"
import test from "node:test"

import {
  enqueueRecordRender,
  MAX_PENDING_RECORD_RENDERS,
} from "../../src/adapters/yunzai/recordRenderGate.js"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test("coalesces duplicate render keys without running the duplicate task", async () => {
  const release = deferred()
  let taskRuns = 0
  const first = enqueueRecordRender(" same-record ", async () => {
    taskRuns += 1
    await release.promise
    return "rendered"
  })
  const duplicate = enqueueRecordRender("same-record", () => {
    taskRuns += 1
    return "duplicate"
  })

  assert.deepEqual(
    { duplicate: first.duplicate, queued: first.queued },
    { duplicate: false, queued: false },
  )
  assert.deepEqual(
    { duplicate: duplicate.duplicate, queued: duplicate.queued },
    { duplicate: true, queued: true },
  )
  assert.equal(duplicate.completion, first.completion)

  release.resolve()
  assert.equal(await duplicate.completion, "rendered")
  assert.equal(taskRuns, 1)
})

test("coalesces a duplicate while the original key is still queued", async () => {
  const release = deferred()
  const blocker = enqueueRecordRender("queue-blocker", () => release.promise)
  let queuedTaskRuns = 0
  const queued = enqueueRecordRender("queued-record", () => {
    queuedTaskRuns += 1
    return "queued-result"
  })
  const duplicate = enqueueRecordRender("queued-record", () => {
    queuedTaskRuns += 1
    return "duplicate-result"
  })

  assert.equal(queued.queued, true)
  assert.equal(duplicate.duplicate, true)
  assert.equal(duplicate.completion, queued.completion)
  assert.equal(queuedTaskRuns, 0)

  release.resolve()
  await blocker.completion
  assert.equal(await duplicate.completion, "queued-result")
  assert.equal(queuedTaskRuns, 1)
})

test("runs different render keys strictly one at a time in insertion order", async () => {
  const releases = [deferred(), deferred(), deferred()]
  const events = []
  let inFlight = 0
  let maxInFlight = 0

  const jobs = ["first", "second", "third"].map((key, index) =>
    enqueueRecordRender(key, async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      events.push(`${key}:start`)
      await releases[index].promise
      events.push(`${key}:end`)
      inFlight -= 1
      return key
    }),
  )

  assert.deepEqual(jobs.map(job => job.queued), [false, true, true])
  await Promise.resolve()
  assert.deepEqual(events, ["first:start"])

  releases[0].resolve()
  assert.equal(await jobs[0].completion, "first")
  await Promise.resolve()
  assert.deepEqual(events, ["first:start", "first:end", "second:start"])

  releases[1].resolve()
  assert.equal(await jobs[1].completion, "second")
  await Promise.resolve()
  assert.deepEqual(events, [
    "first:start",
    "first:end",
    "second:start",
    "second:end",
    "third:start",
  ])

  releases[2].resolve()
  assert.equal(await jobs[2].completion, "third")
  assert.equal(maxInFlight, 1)
})

test("releases a failed key and continues with the next queued render", async () => {
  const failure = new Error("renderer unavailable")
  const events = []
  const failed = enqueueRecordRender("retryable", async () => {
    events.push("failed:start")
    throw failure
  })
  const next = enqueueRecordRender("next", async () => {
    events.push("next:start")
    return "next-result"
  })

  await assert.rejects(failed.completion, error => error === failure)
  assert.equal(await next.completion, "next-result")
  assert.deepEqual(events, ["failed:start", "next:start"])

  const retried = enqueueRecordRender("retryable", () => "retry-result")
  assert.equal(retried.duplicate, false)
  assert.equal(retried.queued, false)
  assert.equal(await retried.completion, "retry-result")
})

test("rejects blank keys and non-function tasks synchronously", () => {
  assert.throws(() => enqueueRecordRender("", () => {}), TypeError)
  assert.throws(() => enqueueRecordRender("   ", () => {}), TypeError)
  assert.throws(() => enqueueRecordRender(null, () => {}), TypeError)
  assert.throws(() => enqueueRecordRender("valid", null), TypeError)
})

test("bounds the global waiting queue and recovers after it drains", async () => {
  const release = deferred()
  const blocker = enqueueRecordRender("bounded-blocker", () => release.promise)
  const queued = Array.from({ length: MAX_PENDING_RECORD_RENDERS }, (_, index) =>
    enqueueRecordRender(`bounded-${index}`, () => index),
  )

  assert.throws(
    () => enqueueRecordRender("bounded-overflow", () => "overflow"),
    error => error?.code === "RENDER_QUEUE_FULL",
  )

  release.resolve()
  await blocker.completion
  assert.deepEqual(
    await Promise.all(queued.map(job => job.completion)),
    Array.from({ length: MAX_PENDING_RECORD_RENDERS }, (_, index) => index),
  )
  assert.equal(await enqueueRecordRender("bounded-after", () => "ok").completion, "ok")
})
