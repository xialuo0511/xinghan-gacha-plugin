import { AUTH_ENDPOINTS } from "../protocol/endpoints.js"
import { assertApiSuccess, ProtocolError, requestJson } from "../protocol/http.js"
import { credentialCookie } from "./cookies.js"

export class CredentialExchangeClient {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.fetchImpl = fetchImpl
  }

  async getCookieToken(credential, { signal } = {}) {
    const url = new URL(AUTH_ENDPOINTS.cookieTokenCn)
    url.search = new URLSearchParams({
      game_biz: "hk4e_cn",
      stoken: String(credential.stoken),
      uid: String(credential.accountId),
      mid: String(credential.mid),
    })
    const response = await requestJson(this.fetchImpl, {
      url,
      headers: { cookie: credentialCookie(credential) },
      signal,
    })
    const data = assertApiSuccess(response.data, "Cookie token exchange")
    if (!data?.cookie_token) {
      throw new ProtocolError("MISSING_COOKIE_TOKEN", "Cookie token exchange returned no token")
    }
    return String(data.cookie_token)
  }
}
