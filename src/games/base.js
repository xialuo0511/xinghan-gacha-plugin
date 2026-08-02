import { PROTOCOL_PROFILES } from "../protocol/profiles.js"

function requiredString(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new TypeError(`${field} is required`)
  }
  return String(value)
}

function optionalString(value) {
  return value === undefined || value === null ? undefined : String(value)
}

function recordId(value) {
  const id = requiredString(value, "id")
  if (!/^\d+$/.test(id)) throw new TypeError("Gacha record id must contain digits only")
  return id
}

export function createGameAdapter(game, definition) {
  function marketForRegion(region) {
    return Object.entries(definition.markets).find(([, value]) => value.regions.includes(region))?.[0]
  }

  function marketForGameBiz(gameBiz) {
    return Object.entries(definition.markets).find(([, value]) => value.gameBiz === gameBiz)?.[0]
  }

  function poolForQueryType(queryType) {
    const type = String(queryType)
    return definition.pools.find(pool => pool.queryType === type || pool.responseTypes.includes(type))
  }

  function gameBiz(region) {
    const market = marketForRegion(region)
    if (!market) throw new RangeError("Unsupported region")
    return definition.markets[market].gameBiz
  }

  function buildQuery(auth, poolInput, cursor = "0", page = "1") {
    const pool = typeof poolInput === "string" ? poolForQueryType(poolInput) : poolInput
    if (!pool) throw new RangeError("Unsupported gacha pool")

    const expectedGameBiz = gameBiz(requiredString(auth.region, "region"))
    if (requiredString(auth.gameBiz, "gameBiz") !== expectedGameBiz) {
      throw new RangeError("gameBiz and region do not match")
    }

    const profile = PROTOCOL_PROFILES.gachaQuery
    const query = new URLSearchParams({
      authkey_ver: profile.authkeyVer,
      sign_type: profile.signType,
      auth_appid: profile.authAppid,
      authkey: requiredString(auth.authkey, "authkey"),
      game_biz: expectedGameBiz,
      region: String(auth.region),
      lang: String(auth.lang ?? profile.defaultLanguage),
      page: requiredString(page, "page"),
      size: profile.pageSize,
      end_id: requiredString(cursor, "cursor"),
    })

    if (game === "genshin") {
      query.set("init_type", "301")
      query.set("gacha_type", pool.queryType)
    } else if (game === "starrail") {
      query.set("default_gacha_type", "11")
      query.set("gacha_type", pool.queryType)
    } else if (game === "zzz") {
      query.set("init_log_gacha_type", pool.longType)
      query.set("init_log_gacha_base_type", pool.queryType)
      query.set("gacha_type", pool.longType)
      query.set("real_gacha_type", pool.queryType)
    }

    return query
  }

  function normalize(item, context) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TypeError("Gacha item must be an object")
    }
    const rawType = item.real_gacha_type ?? item.gacha_type
    const pool = poolForQueryType(requiredString(rawType, "gachaType"))
    if (!pool) throw new RangeError("Unsupported response gacha type")

    const expectedGameBiz = gameBiz(requiredString(context.region, "region"))
    if (context.gameBiz !== undefined && String(context.gameBiz) !== expectedGameBiz) {
      throw new RangeError("gameBiz and region do not match")
    }

    return {
      game,
      gameBiz: expectedGameBiz,
      uid: requiredString(context.uid, "uid"),
      id: recordId(item.id),
      gachaType: pool.queryType,
      gachaId: optionalString(item.gacha_id),
      itemId: optionalString(item.item_id),
      name: optionalString(item.name),
      itemType: optionalString(item.item_type),
      rankType: optionalString(item.rank_type),
      isUp: optionalString(item.is_up ?? item.isUp),
      count: String(item.count ?? "1"),
      time: requiredString(item.time, "time"),
      lang: String(item.lang ?? context.lang ?? PROTOCOL_PROFILES.gachaQuery.defaultLanguage),
    }
  }

  return Object.freeze({
    game,
    displayName: definition.displayName,
    roleBizCandidates: definition.roleBizCandidates,
    markets: definition.markets,
    pools: definition.pools,
    marketForRegion,
    marketForGameBiz,
    poolForQueryType,
    gameBiz,
    buildQuery,
    normalize,
  })
}
