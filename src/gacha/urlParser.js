import { findGachaEndpoint, getEndpointCandidates } from "../protocol/endpoints.js"
import { getGameAdapter } from "../games/registry.js"
import { PROTOCOL_PROFILES } from "../protocol/profiles.js"

const REQUIRED_PARAMS = Object.freeze([
  "sign_type",
  "authkey_ver",
  "authkey",
  "game_biz",
  "region",
  "lang",
])
const OPTIONAL_PASSTHROUGH = Object.freeze([
  "gacha_id",
  "timestamp",
  "device_type",
  "game_version",
  "plat_type",
  "win_mode",
])
const MAX_URL_LENGTH = 16_384
const MAX_AUTHKEY_LENGTH = 8_192

export class GachaUrlError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "GachaUrlError"
    this.code = code
  }
}

function fail(code, message) {
  throw new GachaUrlError(code, message)
}

function queryTypeFor(game, params) {
  if (game === "zzz") return params.get("real_gacha_type")
  return params.get("gacha_type")
}

function hasSecondEncoding(value) {
  return /%[0-9a-f]{2}/i.test(value)
}

function requireSingle(params, key) {
  if (params.getAll(key).length !== 1 || params.get(key) === "") {
    fail("AMBIGUOUS_PARAMETER", `Gacha parameter must occur exactly once: ${key}`)
  }
  return params.get(key)
}

export function parseGachaUrl(input) {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_URL_LENGTH) {
    fail("INVALID_INPUT", "Gacha URL must be a reasonably sized string")
  }

  let url
  try {
    url = new URL(input)
  } catch {
    fail("INVALID_URL", "Gacha URL is not valid")
  }

  if (url.protocol !== "https:") fail("HTTPS_REQUIRED", "Gacha URL must use HTTPS")
  if (url.username || url.password) fail("USERINFO_FORBIDDEN", "URL user information is forbidden")
  if (url.hash) fail("FRAGMENT_FORBIDDEN", "URL fragments are not accepted")

  const endpoint = findGachaEndpoint(url)
  if (!endpoint) fail("UNTRUSTED_ENDPOINT", "Gacha URL endpoint is not trusted")

  for (const key of REQUIRED_PARAMS) {
    if (!url.searchParams.has(key) || url.searchParams.get(key) === "") {
      fail("MISSING_PARAMETER", `Required gacha parameter is missing: ${key}`)
    }
    requireSingle(url.searchParams, key)
  }

  const profile = PROTOCOL_PROFILES.gachaQuery
  if (url.searchParams.get("sign_type") !== profile.signType) {
    fail("UNSUPPORTED_SIGN_TYPE", "Unsupported gacha sign_type")
  }
  if (url.searchParams.get("authkey_ver") !== profile.authkeyVer) {
    fail("UNSUPPORTED_AUTHKEY_VERSION", "Unsupported authkey version")
  }
  const authAppid = url.searchParams.get("auth_appid")
  if (url.searchParams.getAll("auth_appid").length > 1) {
    fail("AMBIGUOUS_PARAMETER", "auth_appid must not be repeated")
  }
  if (authAppid && authAppid !== profile.authAppid) {
    fail("UNSUPPORTED_AUTH_APPID", "Unsupported auth_appid")
  }

  const authkey = url.searchParams.get("authkey")
  if (authkey.length > MAX_AUTHKEY_LENGTH) fail("AUTHKEY_TOO_LONG", "authkey is too long")
  if (hasSecondEncoding(authkey)) fail("DOUBLE_ENCODED_AUTHKEY", "authkey appears to be encoded twice")

  const adapter = getGameAdapter(endpoint.game)
  const gameBiz = url.searchParams.get("game_biz")
  const region = url.searchParams.get("region")
  const market = adapter.marketForGameBiz(gameBiz)
  if (!market || market !== endpoint.market || !adapter.markets[market].regions.includes(region)) {
    fail("REGION_MISMATCH", "game_biz, region, and endpoint market do not match")
  }

  const queryType = queryTypeFor(endpoint.game, url.searchParams)
  if (!queryType) fail("MISSING_POOL", "Gacha pool type is missing")
  requireSingle(url.searchParams, endpoint.game === "zzz" ? "real_gacha_type" : "gacha_type")
  const pool = adapter.poolForQueryType(queryType)
  if (!pool) fail("UNSUPPORTED_POOL", "Gacha pool type is not supported")
  if (endpoint.game === "zzz") {
    requireSingle(url.searchParams, "gacha_type")
    if (url.searchParams.get("gacha_type") !== pool.longType) {
      fail("ZZZ_POOL_MISMATCH", "ZZZ short and long pool types do not match")
    }
  }
  if (pool.endpointKind !== endpoint.kind) {
    fail("ENDPOINT_KIND_MISMATCH", "Gacha pool does not match endpoint kind")
  }

  const optional = Object.fromEntries(
    OPTIONAL_PASSTHROUGH.filter(key => url.searchParams.has(key)).map(key => [
      key,
      url.searchParams.get(key),
    ]),
  )

  return Object.freeze({
    game: endpoint.game,
    market,
    sourceEndpointKey: endpoint.key,
    gameBiz,
    region,
    lang: url.searchParams.get("lang"),
    authkey,
    pool,
    optional: Object.freeze(optional),
  })
}

export function rebuildTrustedGachaUrl(parsed, { cursor = "0", queryType } = {}) {
  const adapter = getGameAdapter(parsed.game)
  const pool = queryType ? adapter.poolForQueryType(queryType) : parsed.pool
  if (!pool) throw new RangeError("Unsupported gacha pool")

  const [primary] = getEndpointCandidates(parsed.game, parsed.market, pool.endpointKind)
  const url = new URL(primary.url)
  url.search = adapter.buildQuery(
    {
      authkey: parsed.authkey,
      gameBiz: parsed.gameBiz,
      region: parsed.region,
      lang: parsed.lang,
    },
    pool,
    cursor,
  )

  for (const [key, value] of Object.entries(parsed.optional ?? {})) {
    if (!OPTIONAL_PASSTHROUGH.includes(key)) continue
    if (value !== null && value !== "") url.searchParams.set(key, value)
  }
  return url
}

export function summarizeParsedGachaUrl(parsed) {
  return Object.freeze({
    game: parsed.game,
    market: parsed.market,
    gameBiz: parsed.gameBiz,
    region: parsed.region,
    pool: parsed.pool.queryType,
    sourceEndpointKey: parsed.sourceEndpointKey,
  })
}
