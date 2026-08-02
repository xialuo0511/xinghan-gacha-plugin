function endpoint(key, url, { fallback = false } = {}) {
  return Object.freeze({ key, url, fallback })
}

export const AUTH_ENDPOINTS = Object.freeze({
  qrCreateCn: "https://passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin",
  qrStatusCn: "https://passport-api.mihoyo.com/account/ma-cn-passport/app/queryQRLoginStatus",
  cookieTokenCn: "https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken",
  rolesCn: "https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie",
  authKeyCn: "https://api-takumi.mihoyo.com/binding/api/genAuthKey",
  authKeyGlobal: "https://sg-public-api.hoyoverse.com/binding/api/genAuthKey",
})

export const GACHA_ENDPOINTS = Object.freeze({
  genshin: Object.freeze({
    cn: Object.freeze({
      standard: Object.freeze([
        endpoint("genshin-cn", "https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog"),
      ]),
    }),
    global: Object.freeze({
      standard: Object.freeze([
        endpoint(
          "genshin-global",
          "https://public-operation-hk4e-sg.hoyoverse.com/gacha_info/api/getGachaLog",
        ),
      ]),
    }),
  }),
  starrail: Object.freeze({
    cn: Object.freeze({
      standard: Object.freeze([
        endpoint(
          "starrail-cn-primary",
          "https://public-operation-hkrpg.mihoyo.com/common/gacha_record/api/getGachaLog",
        ),
        endpoint(
          "starrail-cn-legacy",
          "https://public-operation-hkrpg.mihoyo.com/common/hkrpg_gacha_record/api/getGachaLog",
          { fallback: true },
        ),
      ]),
      collaboration: Object.freeze([
        endpoint(
          "starrail-cn-collaboration",
          "https://public-operation-hkrpg.mihoyo.com/common/gacha_record/api/getLdGachaLog",
        ),
        endpoint(
          "starrail-cn-collaboration-legacy",
          "https://public-operation-hkrpg.mihoyo.com/common/hkrpg_gacha_record/api/getLdGachaLog",
          { fallback: true },
        ),
      ]),
    }),
    global: Object.freeze({
      standard: Object.freeze([
        endpoint(
          "starrail-global-primary",
          "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
        ),
        endpoint(
          "starrail-global-legacy",
          "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getGachaLog",
          { fallback: true },
        ),
      ]),
      collaboration: Object.freeze([
        endpoint(
          "starrail-global-collaboration",
          "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getLdGachaLog",
        ),
        endpoint(
          "starrail-global-collaboration-legacy",
          "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getLdGachaLog",
          { fallback: true },
        ),
      ]),
    }),
  }),
  zzz: Object.freeze({
    cn: Object.freeze({
      standard: Object.freeze([
        endpoint(
          "zzz-cn-primary",
          "https://public-operation-nap.mihoyo.com/common/gacha_record/api/getGachaLog",
        ),
        endpoint(
          "zzz-cn-common-alias",
          "https://public-operation-common.mihoyo.com/common/gacha_record/api/getGachaLog",
          { fallback: true },
        ),
      ]),
    }),
    global: Object.freeze({
      standard: Object.freeze([
        endpoint(
          "zzz-global-primary",
          "https://public-operation-nap-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
        ),
        endpoint(
          "zzz-global-common-alias",
          "https://public-operation-common-sg.hoyoverse.com/common/gacha_record/api/getGachaLog",
          { fallback: true },
        ),
      ]),
    }),
  }),
})

function allGachaEndpoints() {
  const result = []
  for (const [game, markets] of Object.entries(GACHA_ENDPOINTS)) {
    for (const [market, kinds] of Object.entries(markets)) {
      for (const [kind, candidates] of Object.entries(kinds)) {
        for (const candidate of candidates) result.push({ game, market, kind, ...candidate })
      }
    }
  }
  return result
}

export const GACHA_ENDPOINT_LIST = Object.freeze(allGachaEndpoints().map(Object.freeze))
export const TRUSTED_GACHA_HOSTS = Object.freeze([
  ...new Set(GACHA_ENDPOINT_LIST.map(item => new URL(item.url).hostname)),
].sort())

export function getEndpointCandidates(game, market, kind = "standard") {
  const candidates = GACHA_ENDPOINTS[game]?.[market]?.[kind]
  if (!candidates) throw new RangeError("Unknown game, market, or endpoint kind")
  return candidates
}

export function findGachaEndpoint(input) {
  const url = input instanceof URL ? input : new URL(input)
  return GACHA_ENDPOINT_LIST.find(candidate => {
    const trusted = new URL(candidate.url)
    return url.origin === trusted.origin && url.pathname === trusted.pathname
  })
}
