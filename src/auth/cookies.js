import { ProtocolError } from "../protocol/http.js"

function safeCookieValue(value, name) {
  const text = String(value ?? "")
  if (!text || /[;\r\n]/.test(text)) {
    throw new ProtocolError("INVALID_CREDENTIAL", `Credential field is invalid: ${name}`)
  }
  return text
}

export function credentialCookie(credential, { cookieToken } = {}) {
  const parts = [
    `stuid=${safeCookieValue(credential.accountId, "accountId")}`,
    `account_id=${safeCookieValue(credential.accountId, "accountId")}`,
    `stoken=${safeCookieValue(credential.stoken, "stoken")}`,
    `mid=${safeCookieValue(credential.mid, "mid")}`,
  ]
  if (cookieToken) parts.push(`cookie_token=${safeCookieValue(cookieToken, "cookieToken")}`)
  return parts.join("; ")
}
