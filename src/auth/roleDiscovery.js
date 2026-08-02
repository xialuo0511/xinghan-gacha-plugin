import { getGameAdapter } from "../games/registry.js"
import { AUTH_ENDPOINTS } from "../protocol/endpoints.js"
import { assertApiSuccess, requestJson } from "../protocol/http.js"
import { PROTOCOL_PROFILES } from "../protocol/profiles.js"
import { createDs } from "../protocol/signatures.js"
import { credentialCookie } from "./cookies.js"

const CN_ROLE_BIZ = Object.freeze({
  genshin: "hk4e_cn",
  starrail: "hkrpg_cn",
  zzz: "nap_cn",
})

export class RoleDiscoveryClient {
  constructor({
    fetchImpl = globalThis.fetch,
    profile = PROTOCOL_PROFILES.communityCn.roles,
    now = Date.now,
    random,
  } = {}) {
    this.fetchImpl = fetchImpl
    this.profile = profile
    this.now = now
    this.random = random
  }

  headers(credential, cookieToken) {
    const profile = this.profile
    return {
      "accept-language": "zh-CN,zh;q=0.9",
      "x-rpc-device_id": credential.device.id,
      "user-agent": `Mozilla/5.0 miHoYoBBS/${profile.appVersion}`,
      referer: "https://app.mihoyo.com",
      "x-rpc-channel": profile.channel,
      "x-rpc-app_version": profile.appVersion,
      "x-requested-with": "com.mihoyo.hyperion",
      "x-rpc-client_type": profile.clientType,
      "content-type": "application/json;charset=UTF-8",
      ds: createDs({ salt: profile.dsSalt, now: this.now, random: this.random }),
      cookie: credentialCookie(credential, { cookieToken }),
    }
  }

  async discoverGame(game, credential, cookieToken, { signal } = {}) {
    const gameBiz = CN_ROLE_BIZ[game]
    const url = new URL(AUTH_ENDPOINTS.rolesCn)
    url.search = new URLSearchParams({ game_biz: gameBiz })
    const response = await requestJson(this.fetchImpl, {
      url,
      headers: this.headers(credential, cookieToken),
      signal,
    })
    const data = assertApiSuccess(response.data, `${game} role discovery`)
    const adapter = getGameAdapter(game)
    const list = Array.isArray(data?.list) ? data.list : []

    return list.flatMap(item => {
      const uid = item?.game_uid
      const region = item?.region
      if (!uid || !region || adapter.marketForRegion(String(region)) !== "cn") return []
      return [
        Object.freeze({
          game,
          gameBiz,
          uid: String(uid),
          region: String(region),
          regionName: String(item.region_name ?? region),
          nickname: String(item.nickname ?? ""),
          level: String(item.level ?? ""),
        }),
      ]
    })
  }

  async discover(credential, cookieToken, { signal } = {}) {
    const roles = []
    const errors = []
    for (const game of Object.keys(CN_ROLE_BIZ)) {
      try {
        roles.push(...(await this.discoverGame(game, credential, cookieToken, { signal })))
      } catch (error) {
        errors.push(
          Object.freeze({
            game,
            code: String(error?.code ?? "UNKNOWN_ERROR"),
            retcode: error?.retcode,
          }),
        )
      }
    }
    return Object.freeze({ roles: Object.freeze(roles), errors: Object.freeze(errors) })
  }
}
