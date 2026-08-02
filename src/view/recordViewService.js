import { compareRecordIds, getGameAdapter } from "../games/registry.js"
import { ProtocolError } from "../protocol/http.js"

const RARITY = Object.freeze({
  genshin: Object.freeze({ high: "5" }),
  starrail: Object.freeze({ high: "5" }),
  zzz: Object.freeze({ high: "4" }),
})

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
    eyebrow: "提瓦特 · 祈愿档案",
    title: "原神祈愿记录",
    subtitle: "星辉落定，旅途中的每一次相遇都值得被记住。",
  }),
  starrail: Object.freeze({
    eyebrow: "星穹列车 · 跃迁档案",
    title: "星穹铁道跃迁记录",
    subtitle: "沿银轨回望每一次跃迁，让群星为旅程作证。",
  }),
  zzz: Object.freeze({
    eyebrow: "新艾利都 · 调频档案",
    title: "绝区零调频记录",
    subtitle: "信号已接入：欧气、保底与出货记录同步上屏。",
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
  if (game === "starrail" && ["12", "22"].includes(pool.queryType)) return 80
  if (game === "zzz" && ["3", "5", "103"].includes(pool.queryType)) return 80
  return 90
}

function pullLuck(pulls, pityCap) {
  const ratio = pulls / pityCap
  if (ratio <= 0.35) return Object.freeze({ label: "欧皇", tone: "lucky" })
  if (ratio <= 0.6) return Object.freeze({ label: "小欧", tone: "good" })
  if (ratio <= 0.8) return Object.freeze({ label: "常态", tone: "steady" })
  if (ratio < 1) return Object.freeze({ label: "偏非", tone: "warning" })
  return Object.freeze({ label: "大保底", tone: "hard" })
}

function analyzePool(game, pool, records) {
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
        name: record.name ?? record.itemId ?? "未知物品",
        time: record.time,
        pulls: currentPity,
        pullLuck: pullLuck(currentPity, cap),
        status,
        poolName: pool.name,
      }),
    )
    currentPity = 0
  }

  const highCount = highlights.length
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
      upCount,
      offCount,
      latestHigh: highlights.at(-1)?.name,
    }),
    highlights: highlights.reverse(),
  })
}

function luckCopy(game, average, highCount) {
  if (!highCount || average === undefined) {
    return Object.freeze({ label: "欧非待揭晓", tone: "unknown", message: "记录里的高稀有样本还不够，先让运势飞一会儿。" })
  }
  let label
  let tone
  if (average <= 50) [label, tone] = ["欧皇", "lucky"]
  else if (average <= 65) [label, tone] = ["小欧", "good"]
  else if (average <= 78) [label, tone] = ["常态", "steady"]
  else [label, tone] = ["非酋预警", "warning"]

  const messages = {
    genshin: {
      lucky: "风神都在替你推来金光，这份欧气请继续保持。",
      good: "派蒙认证：最近的祈愿运势相当在线。",
      steady: "提瓦特的星轨平稳，保底与惊喜都在正常巡航。",
      warning: "非酋颜色亮起，但下一颗金星也许已经在路上。",
    },
    starrail: {
      lucky: "跃迁欧气已超频，群星正在向你靠拢。",
      good: "帕姆播报：本次列车运势优于平均线。",
      steady: "银轨运行平稳，下一站仍有提前出金的可能。",
      warning: "非酋警报响起——请相信列车终会驶出隧道。",
    },
    zzz: {
      lucky: "信号满格，欧气正在新艾利都街头爆棚。",
      good: "录像店今日运势不错，出货节奏很有型。",
      steady: "调频信号稳定，保底计数仍在可控区间。",
      warning: "非酋色块已上线，下一次调频请务必给力。",
    },
  }
  return Object.freeze({ label, tone, message: messages[game][tone] })
}

function safeAverage(values) {
  if (values.length === 0) return undefined
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
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
    const highPulls = highlights.map(item => item.pulls)
    const averageHighPity = safeAverage(highPulls)
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
      luck: luckCopy(game, averageHighPity, highlights.length),
      pools: Object.freeze(poolAnalyses.map(analysis => analysis.pool)),
      highlights: Object.freeze(highlights.slice(0, 12)),
      disclaimer:
        "仅展示最近 12 个高稀有出货；抽数与欧非分级按本地记录内区间及对应卡池保底计算。UP/歪仅标记限定角色池。",
    })
  }
}
