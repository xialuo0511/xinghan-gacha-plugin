import { ProtocolError } from "../../protocol/http.js"

export const RECORD_VIEW_LOAD_TIMEOUT_MS = 15_000

const VIEW_LOAD_TIMEOUT = Symbol("RecordViewLoadTimeout")

function timeoutError(timeoutMs) {
  const error = new ProtocolError(
    "RECORD_VIEW_TIMEOUT",
    `Record view loading exceeded ${timeoutMs}ms`,
  )
  error.causeName = "TimeoutError"
  return error
}

/**
 * Bound the side-effect-free view-loading phase before any result page or
 * screenshot is scheduled. Promise.race observes a late load rejection; a late
 * resolution is discarded because callers only continue from this wrapper's result.
 */
export async function loadRecordViewWithTimeout(
  recordViewService,
  userId,
  game,
  { timeoutMs = RECORD_VIEW_LOAD_TIMEOUT_MS } = {},
) {
  if (typeof recordViewService?.get !== "function") {
    throw new TypeError("Record view service is required")
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Record view load timeout must be a positive safe integer")
  }

  const pendingLoad = Promise.resolve().then(() => recordViewService.get(userId, game))
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(VIEW_LOAD_TIMEOUT), timeoutMs)
    timer.unref?.()
  })

  try {
    const result = await Promise.race([pendingLoad, timeout])
    if (result === VIEW_LOAD_TIMEOUT) throw timeoutError(timeoutMs)
    return result
  } finally {
    clearTimeout(timer)
  }
}
