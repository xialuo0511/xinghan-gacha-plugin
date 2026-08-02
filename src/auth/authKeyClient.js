import { AUTH_ENDPOINTS } from "../protocol/endpoints.js"
import { assertApiSuccess, ProtocolError, requestJson } from "../protocol/http.js"
import { PROTOCOL_PROFILES } from "../protocol/profiles.js"
import { createDs } from "../protocol/signatures.js"
import { credentialCookie } from "./cookies.js"

function numericUid(uid) {
  const value = String(uid)
  if (!/^\d{6,12}$/.test(value)) throw new TypeError("game UID must contain 6-12 digits")
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new TypeError("game UID is outside the safe JSON integer range")
  return number
}

export class AuthKeyClient {
  constructor({
    fetchImpl = globalThis.fetch,
    profile = PROTOCOL_PROFILES.communityCn.authKey,
    now = Date.now,
    random,
  } = {}) {
    this.fetchImpl = fetchImpl
    this.profile = profile
    this.now = now
    this.random = random
  }

  headers(credential) {
    const profile = this.profile
    return {
      "content-type": "application/json",
      "x-rpc-app_version": profile.appVersion,
      "user-agent": "okhttp/4.8.0",
      "x-rpc-client_type": profile.clientType,
      referer: "https://app.mihoyo.com",
      origin: "https://webstatic.mihoyo.com",
      cookie: credentialCookie(credential),
      ds: createDs({ salt: profile.dsSalt, now: this.now, random: this.random }),
      "x-rpc-sys_version": profile.systemVersion,
      "x-rpc-channel": profile.channel,
      "x-rpc-device_id": credential.device.id,
      "x-rpc-device_name": credential.device.name,
      "x-rpc-device_model": credential.device.model,
    }
  }

  async generate(credential, role, { signal } = {}) {
    if (!credential?.stoken || !credential?.device) {
      throw new ProtocolError("MISSING_CREDENTIAL", "Stored login credential is incomplete")
    }
    const body = JSON.stringify({
      auth_appid: "webview_gacha",
      game_biz: String(role.gameBiz),
      game_uid: numericUid(role.uid),
      region: String(role.region),
    })
    const response = await requestJson(this.fetchImpl, {
      url: AUTH_ENDPOINTS.authKeyCn,
      method: "POST",
      headers: this.headers(credential),
      body,
      signal,
    })
    const data = assertApiSuccess(response.data, "Authkey generation")
    if (!data?.authkey) throw new ProtocolError("MISSING_AUTHKEY", "Authkey generation returned no key")
    return String(data.authkey)
  }
}
