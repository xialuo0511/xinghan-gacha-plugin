import { ProtocolError } from "../protocol/http.js"

export const UIGF_VERSION = "v4.1"

const ROOT_KEYS = Object.freeze({ genshin: "hk4e", starrail: "hkrpg", zzz: "nap" })
const GAME_KEYS = Object.freeze({ hk4e: "genshin", hkrpg: "starrail", nap: "zzz" })
const TIMEZONES = Object.freeze({
  cn_gf01: 8,
  cn_qd01: 8,
  os_usa: -5,
  os_euro: 1,
  os_asia: 8,
  os_cht: 8,
  prod_gf_cn: 8,
  prod_qd_cn: 8,
  prod_official_usa: -5,
  prod_official_eur: 1,
  prod_official_asia: 8,
  prod_official_cht: 8,
  prod_gf_us: -5,
  prod_gf_eu: 1,
  prod_gf_jp: 9,
  prod_gf_sg: 8,
})
const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const MAX_RECORDS = 1_000_000
const LANGUAGES = new Set([
  "de-de",
  "en-us",
  "es-es",
  "fr-fr",
  "id-id",
  "it-it",
  "ja-jp",
  "ko-kr",
  "pt-pt",
  "ru-ru",
  "th-th",
  "tr-tr",
  "vi-vn",
  "zh-cn",
  "zh-tw",
])

function invalid(message) {
  return new ProtocolError("INVALID_UIGF", message)
}

function required(value, name) {
  if (value === undefined || value === null || value === "") throw invalid(`${name} is required`)
  return String(value)
}

function numeric(value, name) {
  const result = required(value, name)
  if (!/^\d+$/.test(result)) throw invalid(`${name} must contain digits`)
  return result
}

function recordId(value) {
  const id = numeric(value, "id")
  if (id.length > 19) throw invalid("id must not exceed 19 digits")
  return id
}

function time(value) {
  const result = required(value, "time")
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(result)) {
    throw invalid("time has an invalid format")
  }
  return result
}

function language(value) {
  const result = String(value ?? "zh-cn").toLowerCase()
  if (!LANGUAGES.has(result)) throw invalid("lang is not supported")
  return result
}

function optional(value) {
  return value === undefined || value === null ? undefined : String(value)
}

function put(target, key, value) {
  if (value !== undefined) target[key] = value
}

function exportType(game, value) {
  const type = String(value)
  if (game === "zzz" && type === "102") return "2"
  if (game === "zzz" && type === "103") return "3"
  return type
}

function exportRecord(game, record) {
  const result = {
    gacha_type: exportType(game, record.gachaType),
    item_id: String(record.itemId ?? ""),
    time: time(record.time),
    id: recordId(record.id),
  }
  if (game === "genshin") result.uigf_gacha_type = result.gacha_type
  if (game === "starrail") result.gacha_id = String(record.gachaId ?? "")
  put(result, "name", optional(record.name))
  put(result, "item_type", optional(record.itemType))
  put(result, "rank_type", optional(record.rankType))
  put(result, "count", optional(record.count) ?? "1")
  return result
}

function accountTimezone(role) {
  const timezone = TIMEZONES[role.region]
  if (timezone === undefined) throw new RangeError(`Unsupported UIGF region: ${role.region}`)
  return timezone
}

export function buildUigf({ accounts, appVersion, now = () => Date.now() }) {
  const result = {
    info: {
      export_timestamp: Math.floor(now() / 1000),
      export_app: "xinghan-gacha-plugin",
      export_app_version: String(appVersion),
      version: UIGF_VERSION,
    },
    hk4e: [],
    hkrpg: [],
    nap: [],
  }

  for (const { role, records } of accounts) {
    const rootKey = ROOT_KEYS[role.game]
    if (!rootKey) throw new RangeError(`Unsupported game: ${role.game}`)
    result[rootKey].push({
      uid: numeric(role.uid, "uid"),
      timezone: accountTimezone(role),
      lang: language(role.lang ?? records[0]?.lang),
      list: [...records]
        .sort((left, right) => {
          const a = BigInt(left.id)
          const b = BigInt(right.id)
          return a === b ? 0 : a < b ? -1 : 1
        })
        .map(record => exportRecord(role.game, record)),
    })
  }
  return result
}

function parseRoot(input) {
  if (typeof input === "string" || Buffer.isBuffer(input)) {
    const text = Buffer.isBuffer(input) ? input.toString("utf8") : input
    if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) throw invalid("Import file is too large")
    try {
      return JSON.parse(text)
    } catch {
      throw invalid("Import file is not valid JSON")
    }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("Import root must be an object")
  }
  return input
}

function normalizeImportedRecord(game, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw invalid("Gacha record must be an object")
  }
  const gachaType = required(
    game === "genshin" ? record.uigf_gacha_type ?? record.gacha_type : record.gacha_type,
    "gacha_type",
  )
  return {
    id: recordId(record.id),
    gacha_type: gachaType,
    real_gacha_type: gachaType,
    gacha_id: optional(record.gacha_id),
    item_id: optional(record.item_id),
    name: optional(record.name),
    item_type: optional(record.item_type),
    rank_type: optional(record.rank_type),
    count: optional(record.count) ?? "1",
    time: time(record.time),
    lang: optional(record.lang),
  }
}

function parseAccounts(rootKey, accounts, total) {
  const game = GAME_KEYS[rootKey]
  if (accounts === undefined) return []
  if (!Array.isArray(accounts)) throw invalid(`${rootKey} must be an array`)
  return accounts.map(account => {
    if (!account || typeof account !== "object" || !Array.isArray(account.list)) {
      throw invalid(`${rootKey} account must contain a list`)
    }
    total.count += account.list.length
    if (total.count > MAX_RECORDS) throw invalid("Import contains too many records")
    return {
      game,
      uid: numeric(account.uid, "uid"),
      timezone: Number(account.timezone),
      lang: language(account.lang),
      records: account.list.map(record => normalizeImportedRecord(game, record)),
    }
  })
}

function parseLegacy(root) {
  if (!Array.isArray(root.list) || !root.info?.uid) return undefined
  const game = /^v1\./.test(String(root.info.srgf_version ?? ""))
    ? "starrail"
    : /^v[123]\./.test(String(root.info.uigf_version ?? ""))
      ? "genshin"
      : undefined
  if (!game) return undefined
  if (root.list.length > MAX_RECORDS) throw invalid("Import contains too many records")
  return [
    {
      game,
      uid: numeric(root.info.uid, "uid"),
      timezone: Number(root.info.region_time_zone ?? root.info.timezone ?? 8),
      lang: language(root.info.lang),
      records: root.list.map(record => normalizeImportedRecord(game, record)),
    },
  ]
}

export function parseUigf(input) {
  const root = parseRoot(input)
  const version = String(root.info?.version ?? "")
  if (/^v4\.[0-2]$/.test(version)) {
    const total = { count: 0 }
    return [
      ...parseAccounts("hk4e", root.hk4e, total),
      ...parseAccounts("hkrpg", root.hkrpg, total),
      ...parseAccounts("nap", root.nap, total),
    ]
  }
  const legacy = parseLegacy(root)
  if (legacy) return legacy
  throw invalid("Unsupported UIGF or SRGF version")
}
