import { AUTH_ENDPOINTS } from "../protocol/endpoints.js"
import { assertApiSuccess, ProtocolError, requestJson } from "../protocol/http.js"
import { PROTOCOL_PROFILES } from "../protocol/profiles.js"
import { createDs2 } from "../protocol/signatures.js"
import { createDeviceProfile } from "./device.js"

const TRUSTED_QR_HOSTS = new Set(["user.mihoyo.com", "user.miyoushe.com"])

function stringField(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new ProtocolError("MISSING_CREDENTIAL", `Confirmed login response is missing ${name}`)
  }
  return String(value)
}

function ticketFromUrl(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    throw new ProtocolError("INVALID_QR_URL", "QR login returned an invalid URL")
  }
  if (url.protocol !== "https:" || url.username || url.password || !TRUSTED_QR_HOSTS.has(url.hostname)) {
    throw new ProtocolError("UNTRUSTED_QR_URL", "QR login returned an untrusted URL")
  }
  return url.searchParams.get("ticket") ?? url.searchParams.get("tk")
}

export class QrLoginClient {
  constructor({
    fetchImpl = globalThis.fetch,
    profile = PROTOCOL_PROFILES.communityCn.qr,
    now = Date.now,
    random,
  } = {}) {
    this.fetchImpl = fetchImpl
    this.profile = profile
    this.now = now
    this.random = random
  }

  createDevice() {
    return createDeviceProfile()
  }

  headers(device, body) {
    const profile = this.profile
    return {
      "x-rpc-device_id": device.id,
      "x-rpc-app_id": profile.appId,
      "x-rpc-device_name": device.name,
      "x-rpc-device_fp": profile.deviceFp,
      "x-rpc-device_model": device.model,
      "x-rpc-app_version": profile.appVersion,
      "x-rpc-game_biz": profile.gameBiz,
      "x-rpc-sys_version": profile.systemVersion,
      "x-rpc-aigis": "",
      "content-type": "application/json",
      "x-rpc-client_type": profile.clientType,
      ds: createDs2({
        salt: profile.dsSalt,
        body,
        now: this.now,
        random: this.random,
      }),
      "x-rpc-sdk_version": profile.sdkVersion,
      "user-agent": profile.userAgent,
      connection: "Keep-Alive",
      "accept-encoding": "gzip, deflate, br",
      "x-rpc-channel": profile.channel,
    }
  }

  async create({ device = this.createDevice(), signal } = {}) {
    const body = JSON.stringify({})
    const response = await requestJson(this.fetchImpl, {
      url: AUTH_ENDPOINTS.qrCreateCn,
      method: "POST",
      headers: this.headers(device, body),
      body,
      signal,
    })
    const data = assertApiSuccess(response.data, "QR login creation")
    const url = stringField(data?.url, "url")
    const ticket = data?.ticket ? String(data.ticket) : ticketFromUrl(url)
    if (!ticket) throw new ProtocolError("MISSING_TICKET", "QR login response is missing ticket")
    ticketFromUrl(url)
    return Object.freeze({ url, ticket, device })
  }

  async query({ device, ticket, signal }) {
    if (!device || !ticket) throw new TypeError("device and ticket are required")
    const body = JSON.stringify({ ticket: String(ticket) })
    const response = await requestJson(this.fetchImpl, {
      url: AUTH_ENDPOINTS.qrStatusCn,
      method: "POST",
      headers: this.headers(device, body),
      body,
      signal,
    })
    if (response.data?.retcode === -3501) return Object.freeze({ state: "Expired" })
    if (response.data?.retcode === -3505) return Object.freeze({ state: "Cancelled" })
    const data = assertApiSuccess(response.data, "QR login status")
    const state = String(data?.status ?? "")
    if (!["Created", "Scanned", "Confirmed"].includes(state)) {
      throw new ProtocolError("UNKNOWN_QR_STATE", "QR login returned an unknown state")
    }
    return Object.freeze({ state, data })
  }

  extractCredential(data, device) {
    const accountId = stringField(
      data?.user_info?.aid ?? data?.user_info?.uid ?? data?.user_info?.account_id,
      "accountId",
    )
    const mid = stringField(data?.user_info?.mid, "mid")
    const tokens = Array.isArray(data?.tokens) ? data.tokens : []
    const selected =
      tokens.find(item => item?.name === "stoken_v2") ??
      tokens.find(item => item?.name === "stoken") ??
      tokens[0]
    const stoken = stringField(selected?.token, "stoken")
    return Object.freeze({ accountId, mid, stoken, device })
  }
}
