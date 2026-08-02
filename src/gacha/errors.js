import { ProtocolError } from "../protocol/http.js"

export class AuthKeyExpiredError extends ProtocolError {
  constructor(retcode) {
    super("AUTHKEY_EXPIRED", "Gacha authkey is expired", { retcode })
  }
}

export class RateLimitError extends ProtocolError {
  constructor(retcode) {
    super("RATE_LIMITED", "Gacha endpoint is rate limited", { retcode })
  }
}

export function classifyGachaError(payload) {
  const retcode = payload?.retcode
  const message = String(payload?.message ?? "")
  if (retcode === -101 || /auth\s*key|authkey/i.test(message)) {
    return new AuthKeyExpiredError(retcode)
  }
  if (retcode === -110 || /frequently|请求过于频繁|访问过于频繁/i.test(message)) {
    return new RateLimitError(retcode)
  }
  return new ProtocolError("GACHA_REMOTE_ERROR", "Gacha endpoint rejected the request", { retcode })
}
