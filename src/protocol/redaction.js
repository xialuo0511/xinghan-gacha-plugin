export const REDACTED = "[REDACTED]"

const SENSITIVE_KEY = /(?:auth(?:orization|key)|cookie|password|secret|ticket|(?:^|[_-])(?:s|l|cookie|access|refresh|login)?tokens?(?:$|[_-]))/i
const QUERY_SECRET = /([?&](?:authkey|auth_key|ticket|token|stoken|ltoken|cookie_token)=)[^&#\s]*/gi
const COOKIE_SECRET = /((?:^|[;\s])(?:stoken(?:_v2)?|stuid|ltoken(?:_v2)?|ltuid|cookie_token|account_id|mid)=)[^;\s,]*/gi

export function isSensitiveKey(key) {
  return SENSITIVE_KEY.test(String(key))
}

export function redactString(input) {
  return String(input)
    .replace(QUERY_SECRET, `$1${REDACTED}`)
    .replace(/(\b(?:cookie|set-cookie|authorization)\s*:\s*)[^\r\n]*/gi, `$1${REDACTED}`)
    .replace(COOKIE_SECRET, `$1${REDACTED}`)
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(
      /(["']?(?:authkey|auth_key|stoken(?:_v2)?|ltoken(?:_v2)?|cookie_token|ticket|access_token|refresh_token)["']?\s*[:=]\s*["']?)[^"',}\s]+/gi,
      `$1${REDACTED}`,
    )
}

export function redact(input, seen = new WeakSet()) {
  if (typeof input === "string") return redactString(input)
  if (input === null || typeof input !== "object") return input
  if (input instanceof URL) return redactString(input.href)
  if (seen.has(input)) return "[Circular]"
  seen.add(input)

  if (input instanceof Error) {
    return {
      name: input.name,
      message: redactString(input.message),
      stack: redactString(input.stack ?? ""),
    }
  }

  if (Array.isArray(input)) return input.map(value => redact(value, seen))

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redact(value, seen),
    ]),
  )
}
