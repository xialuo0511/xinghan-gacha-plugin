import { ProtocolError } from "../../protocol/http.js"

export const MAX_PENDING_RECORD_RENDERS = 24

const pendingRenders = []
const rendersByKey = new Map()

let renderInFlight = false

function normalizeKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new TypeError("Record render key must be a non-empty string")
  }
  return key.trim()
}

function finishRender(entry, succeeded, result) {
  rendersByKey.delete(entry.key)
  renderInFlight = false

  if (succeeded) entry.resolve(result)
  else entry.reject(result)

  drainRenderQueue()
}

function drainRenderQueue() {
  if (renderInFlight) return

  const entry = pendingRenders.shift()
  if (!entry) return

  renderInFlight = true
  void Promise.resolve()
    .then(entry.task)
    .then(
      value => finishRender(entry, true, value),
      error => finishRender(entry, false, error),
    )
}

export function enqueueRecordRender(key, task) {
  const normalizedKey = normalizeKey(key)
  if (typeof task !== "function") {
    throw new TypeError("Record render task must be a function")
  }

  const existing = rendersByKey.get(normalizedKey)
  if (existing) {
    return Object.freeze({
      duplicate: true,
      queued: true,
      completion: existing.completion,
    })
  }

  if (pendingRenders.length >= MAX_PENDING_RECORD_RENDERS) {
    throw new ProtocolError("RENDER_QUEUE_FULL", "The record render queue is full")
  }

  const queued = renderInFlight || pendingRenders.length > 0
  let resolve
  let reject
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    resolve = resolveCompletion
    reject = rejectCompletion
  })
  const entry = {
    key: normalizedKey,
    task,
    completion,
    resolve,
    reject,
  }

  rendersByKey.set(normalizedKey, entry)
  pendingRenders.push(entry)
  drainRenderQueue()

  return Object.freeze({ duplicate: false, queued, completion })
}
