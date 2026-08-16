import { ProtocolError } from "../../protocol/http.js"

export const RECORD_REPLY_TIMEOUT_MS = 30_000
export const RECORD_REPLY_RETRY_DELAY_MS = 750

const REPLY_TIMEOUT = Symbol("RecordReplyTimeout")

function failedReply(result) {
  return result === false || Boolean(result && typeof result === "object" && result.error)
}

function replyError() {
  return new ProtocolError(
    "RENDER_MESSAGE_UNAVAILABLE",
    "The record image message could not be delivered",
  )
}

async function replyOnce(reply, message, timeoutMs) {
  let timeout
  const timeoutPromise = new Promise(resolve => {
    timeout = setTimeout(() => resolve(REPLY_TIMEOUT), timeoutMs)
    timeout.unref?.()
  })
  let result
  try {
    result = await Promise.race([
      Promise.resolve().then(() => reply(message)).catch(() => false),
      timeoutPromise,
    ])
  } finally {
    clearTimeout(timeout)
  }
  if (result === REPLY_TIMEOUT) throw replyError()
  return result
}

export async function checkedRecordReply(
  reply,
  message,
  {
    timeoutMs = RECORD_REPLY_TIMEOUT_MS,
    retryDelayMs = RECORD_REPLY_RETRY_DELAY_MS,
    sleep = delay => new Promise(resolve => setTimeout(resolve, delay)),
  } = {},
) {
  if (typeof reply !== "function") throw new TypeError("Record reply function is required")
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Record reply timeout must be a positive safe integer")
  }
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new RangeError("Record reply retry delay must be a non-negative safe integer")
  }
  if (typeof sleep !== "function") throw new TypeError("Record reply sleep function is required")

  const first = await replyOnce(reply, message, timeoutMs)
  if (!failedReply(first)) return first

  if (retryDelayMs > 0) await sleep(retryDelayMs)
  const second = await replyOnce(reply, message, timeoutMs)
  if (failedReply(second)) throw replyError()
  return second
}
