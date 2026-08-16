import { compareRecordIds, getGameAdapter } from "../games/registry.js"
import { ProtocolError } from "../protocol/http.js"

const RARITY = Object.freeze({
  genshin: Object.freeze({ high: "5" }),
  starrail: Object.freeze({ high: "5" }),
  zzz: Object.freeze({ high: "4" }),
})

// 50,000 source records bound the O(n log n) sort and repeated pool filters.
// 4,096 high-rarity results already require 171 pages at the runtime's
// 24-item page size. Reject larger histories explicitly before sorting and
// expanding them into render models instead of silently hiding results.
export const MAX_RENDERABLE_RECORDS = 50_000
export const MAX_RENDERABLE_HIGH_RARITY_RECORDS = 4_096

const LIMITED_CHARACTER_POOLS = Object.freeze({
  genshin: new Set(["301"]),
  starrail: new Set(["11", "21"]),
  zzz: new Set(["2", "102"]),
})

const STANDARD_CHARACTERS = Object.freeze({
  genshin: new Set([
    "迪卢克",
    "琴",
    "七七",
    "莫娜",
    "刻晴",
    "提纳里",
    "迪希雅",
    "梦见月瑞希",
    "Diluc",
    "Jean",
    "Qiqi",
    "Mona",
    "Keqing",
    "Tighnari",
    "Dehya",
    "Yumemizuki Mizuki",
  ]),
  starrail: new Set([
    "姬子",
    "瓦尔特",
    "布洛妮娅",
    "杰帕德",
    "克拉拉",
    "彦卿",
    "白露",
    "Himeko",
    "Welt",
    "Bronya",
    "Gepard",
    "Clara",
    "Yanqing",
    "Bailu",
  ]),
  zzz: new Set([
    "猫又",
    "猫宫又奈",
    "珂蕾妲",
    "莱卡恩",
    "格莉丝",
    "丽娜",
    "11号",
    "Nekomata",
    "Koleda",
    "Lycaon",
    "Grace",
    "Rina",
    "Soldier 11",
  ]),
})

const THEME_COPY = Object.freeze({
  genshin: Object.freeze({
    eyebrow: "至冬 · 祈愿统计",
    title: "原神祈愿记录",
    subtitle: "全部五星记录按卡池排列",
  }),
  starrail: Object.freeze({
    eyebrow: "星穹铁道 · 跃迁统计",
    title: "星穹铁道跃迁记录",
    subtitle: "全部五星记录按卡池排列",
  }),
  zzz: Object.freeze({
    eyebrow: "绝区零 · 调频统计",
    title: "绝区零调频记录",
    subtitle: "全部 S 级记录按频段排列",
  }),
})

function roleKey(role) {
  return `${role.game}:${role.gameBiz}:${role.uid}:${role.region}`
}

function mergeRoles(credentialRoles = [], storedRoles = []) {
  const roles = new Map()
  for (const role of [...credentialRoles, ...storedRoles]) {
    if (!role?.game || !role?.gameBiz || !role?.uid || !role?.region) continue
    const key = roleKey(role)
    roles.set(key, { ...roles.get(key), ...role })
  }
  return [...roles.values()]
}

function chooseRole(roles, game, selectedUid, requestedUid) {
  const candidates = roles.filter(role => role.game === game)
  const uid = requestedUid ?? selectedUid
  if (uid !== undefined) {
    const role = candidates.find(candidate => candidate.uid === String(uid))
    if (role) return role
  }
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) {
    throw new ProtocolError("NO_GACHA_RECORDS", "No stored records exist for this game")
  }
  throw new ProtocolError("ROLE_REQUIRED", "Multiple roles exist and none is selected")
}

function explicitUp(value) {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  const text = String(value ?? "").toLowerCase()
  if (["true", "1", "yes", "up"].includes(text)) return true
  if (["false", "0", "no", "off"].includes(text)) return false
  return undefined
}

function upStatus(game, record, highRank) {
  if (record.rankType !== highRank || !LIMITED_CHARACTER_POOLS[game].has(record.gachaType)) {
    return undefined
  }
  const marked = explicitUp(record.isUp)
  if (marked === true) return Object.freeze({ label: "UP", tone: "up", source: "record" })
  if (marked === false) return Object.freeze({ label: "歪", tone: "off", source: "record" })
  if (!record.name) return Object.freeze({ label: "待确认", tone: "unknown", source: "missing-name" })
  if (STANDARD_CHARACTERS[game].has(record.name)) {
    return Object.freeze({ label: "歪", tone: "off", source: "standard-catalog" })
  }
  return Object.freeze({ label: "UP", tone: "up", source: "standard-catalog" })
}

function hardPity(game, pool) {
  if (game === "genshin" && pool.queryType === "302") return 80
  if (game === "starrail" && pool.queryType === "2") return 50
  if (game === "starrail" && ["12", "22"].includes(pool.queryType)) return 80
  if (game === "zzz" && ["3", "5", "103"].includes(pool.queryType)) return 80
  return 90
}

function luckTone(ratio) {
  if (ratio <= 0.35) return "lucky"
  if (ratio <= 0.6) return "good"
  if (ratio <= 0.8) return "steady"
  if (ratio < 1) return "warning"
  return "hard"
}

function pullLuck(pulls, pityCap) {
  const tone = luckTone(pulls / pityCap)
  const labels = {
    lucky: "欧皇",
    good: "小欧",
    steady: "常态",
    warning: "偏非",
    hard: "大保底",
  }
  return Object.freeze({ label: labels[tone], tone })
}

function itemKind(game, pool, record) {
  const type = String(record.itemType ?? "").toLowerCase()
  if (/邦布|bangboo/.test(type) || (game === "zzz" && pool.queryType === "5")) return "bangboo"
  if (/武器|光锥|音擎|weapon|light\s*cone|w-engine/.test(type)) return "weapon"
  if (/角色|代理人|character|agent/.test(type)) return "character"
  if (game === "genshin" && pool.queryType === "302") return "weapon"
  if (game === "starrail" && ["12", "22"].includes(pool.queryType)) return "weapon"
  if (game === "zzz" && ["3", "103"].includes(pool.queryType)) return "weapon"
  return "unknown"
}

function dateRange(records) {
  const values = records.map(record => record.time).filter(Boolean).sort()
  if (values.length === 0) return undefined
  return Object.freeze({ from: values[0], to: values.at(-1) })
}

function analyzeDeparturePool(game, pool, records) {
  const spec = RARITY[game]
  const ascending = [...records].sort((left, right) => compareRecordIds(left.id, right.id))
  const cap = hardPity(game, pool)
  const highlights = []
  let guaranteePulls
  let extraHighCount = 0

  for (const [index, record] of ascending.entries()) {
    if (record.rankType !== spec.high) continue
    const absolutePull = index + 1
    const isGuaranteeResult = guaranteePulls === undefined
    if (isGuaranteeResult) guaranteePulls = absolutePull
    else extraHighCount += 1
    highlights.push(
      Object.freeze({
        id: record.id,
        itemId: record.itemId,
        itemType: record.itemType,
        itemKind: itemKind(game, pool, record),
        name: record.name ?? record.itemId ?? "未知物品",
        time: record.time,
        pulls: absolutePull,
        pullPrefix: "第",
        pullLuck: isGuaranteeResult
          ? pullLuck(absolutePull, cap)
          : Object.freeze({ label: "额外金", tone: "lucky" }),
        departureResult: isGuaranteeResult ? "guarantee" : "bonus",
        poolQueryType: pool.queryType,
        poolName: pool.name,
      }),
    )
  }

  const highCount = highlights.length
  const guaranteeConsumed = guaranteePulls !== undefined
  return Object.freeze({
    pool: Object.freeze({
      queryType: pool.queryType,
      name: pool.name,
      total: records.length,
      highCount,
      currentPity: guaranteeConsumed ? undefined : Math.min(records.length, cap),
      pityCap: cap,
      pityPercent: guaranteeConsumed
        ? undefined
        : Math.min(100, Math.round((records.length / cap) * 100)),
      pityMode: guaranteeConsumed ? "consumed" : "finite",
      guaranteePulls,
      extraHighCount,
      averageHighPity: guaranteePulls,
      bestHighPity: guaranteePulls,
      worstHighPity: guaranteePulls,
      upCount: 0,
      offCount: 0,
      latestHigh: highlights.at(-1)?.name,
      dateRange: dateRange(records),
    }),
    highlights: highlights.reverse(),
    summaryPulls: guaranteeConsumed ? Object.freeze([guaranteePulls]) : Object.freeze([]),
    luckRatios: guaranteeConsumed
      ? Object.freeze([guaranteePulls / cap, ...Array(extraHighCount).fill(0)])
      : Object.freeze([]),
  })
}

function analyzePool(game, pool, records) {
  if (game === "starrail" && pool.queryType === "2") {
    return analyzeDeparturePool(game, pool, records)
  }
  const spec = RARITY[game]
  const ascending = [...records].sort((left, right) => compareRecordIds(left.id, right.id))
  const highlights = []
  const cap = hardPity(game, pool)
  let currentPity = 0

  for (const record of ascending) {
    currentPity += 1
    if (record.rankType !== spec.high) continue
    const status = upStatus(game, record, spec.high)
    highlights.push(
      Object.freeze({
        id: record.id,
        itemId: record.itemId,
        itemType: record.itemType,
        itemKind: itemKind(game, pool, record),
        name: record.name ?? record.itemId ?? "未知物品",
        time: record.time,
        pulls: currentPity,
        pullLuck: pullLuck(currentPity, cap),
        status,
        poolQueryType: pool.queryType,
        poolName: pool.name,
      }),
    )
    currentPity = 0
  }

  const highCount = highlights.length
  const highPulls = highlights.map(item => item.pulls)
  const upCount = highlights.filter(item => item.status?.tone === "up").length
  const offCount = highlights.filter(item => item.status?.tone === "off").length
  return Object.freeze({
    pool: Object.freeze({
      queryType: pool.queryType,
      name: pool.name,
      total: records.length,
      highCount,
      currentPity,
      pityCap: cap,
      pityPercent: Math.min(100, Math.round((currentPity / cap) * 100)),
      averageHighPity: safeAverage(highPulls),
      bestHighPity: highPulls.length ? Math.min(...highPulls) : undefined,
      worstHighPity: highPulls.length ? Math.max(...highPulls) : undefined,
      upCount,
      offCount,
      latestHigh: highlights.at(-1)?.name,
      dateRange: dateRange(records),
    }),
    highlights: highlights.reverse(),
    summaryPulls: Object.freeze(highPulls),
    luckRatios: Object.freeze(highPulls.map(pulls => pulls / cap)),
  })
}

function luckCopy(averageRatio, highCount) {
  if (!highCount || averageRatio === undefined) {
    return Object.freeze({ label: "暂无评价", tone: "unknown" })
  }
  const tone = luckTone(averageRatio)
  const labels = {
    lucky: "欧皇",
    good: "小欧",
    steady: "常态",
    warning: "偏非",
    hard: "大保底",
  }
  return Object.freeze({ label: labels[tone], tone })
}

function mean(values) {
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function safeAverage(values) {
  const average = mean(values)
  return average === undefined ? undefined : Math.round(average * 10) / 10
}

function assertRenderableHistory(game, records) {
  if (records.length > MAX_RENDERABLE_RECORDS) {
    throw new ProtocolError(
      "RECORD_VIEW_TOO_LARGE",
      `Record view exceeds the ${MAX_RENDERABLE_RECORDS} total record limit`,
    )
  }
  const highRank = RARITY[game].high
  let count = 0
  for (const record of records) {
    if (record.rankType !== highRank) continue
    count += 1
    if (count > MAX_RENDERABLE_HIGH_RARITY_RECORDS) {
      throw new ProtocolError(
        "RECORD_VIEW_TOO_LARGE",
        `Record view exceeds the ${MAX_RENDERABLE_HIGH_RARITY_RECORDS} high-rarity item limit`,
      )
    }
  }
}

export class RecordViewService {
  constructor({ credentialStore, recordStore, now = () => new Date() }) {
    if (!credentialStore || !recordStore) throw new TypeError("Record view stores are required")
    Object.assign(this, { credentialStore, recordStore, now })
  }

  async get(userId, game, { uid } = {}) {
    const adapter = getGameAdapter(game)
    const credential = await this.credentialStore.load(userId)
    const storedRoles = await this.recordStore.listRoles(userId)
    const roles = mergeRoles(credential?.roles, storedRoles)
    const role = chooseRole(roles, game, credential?.selectedRoles?.[game], uid)
    const source = await this.recordStore.load(userId, role)
    if (source.length === 0) {
      throw new ProtocolError("NO_GACHA_RECORDS", "No records exist for the selected role")
    }
    assertRenderableHistory(game, source)

    const records = [...source].sort((left, right) => compareRecordIds(right.id, left.id))
    const poolAnalyses = adapter.pools.map(pool =>
      analyzePool(
        game,
        pool,
        records.filter(record => record.gachaType === pool.queryType),
      ),
    )
    const highlights = poolAnalyses
      .flatMap(analysis => analysis.highlights)
      .sort((left, right) => compareRecordIds(right.id, left.id))
    const highPulls = poolAnalyses.flatMap(analysis => analysis.summaryPulls)
    const averageHighPity = safeAverage(highPulls)
    const averageHighPityRatio = mean(poolAnalyses.flatMap(analysis => analysis.luckRatios))
    const upCount = highlights.filter(item => item.status?.tone === "up").length
    const offCount = highlights.filter(item => item.status?.tone === "off").length
    const unknownUpCount = highlights.filter(item => item.status?.tone === "unknown").length

    return Object.freeze({
      game,
      theme: THEME_COPY[game],
      uid: role.uid,
      region: role.regionName ?? role.region,
      generatedAt: this.now().toISOString(),
      latestRecordAt: records[0]?.time,
      summary: Object.freeze({
        total: records.length,
        highCount: highlights.length,
        averageHighPity,
        upCount,
        offCount,
        unknownUpCount,
      }),
      luck: luckCopy(averageHighPityRatio, highlights.length),
      pools: Object.freeze(
        poolAnalyses.map(analysis => Object.freeze({
          ...analysis.pool,
          items: Object.freeze([...analysis.highlights]),
        })),
      ),
      disclaimer:
        "按卡池展示全部高稀有结果；抽数与欧非分级按本地记录内区间及对应卡池规则计算。" +
        (game === "starrail" ? "始发跃迁仅计算一次性 50 抽首金进度。" : "") +
        "UP/歪仅标记限定角色池。",
    })
  }
}
