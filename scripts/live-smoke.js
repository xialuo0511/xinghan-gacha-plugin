import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { MemoryAuthKeyCache } from "../src/auth/authKeyCache.js"
import { GachaApiClient } from "../src/gacha/gachaApiClient.js"
import { GenshinSyncService } from "../src/gacha/genshinSyncService.js"
import { StarRailSyncService } from "../src/gacha/starRailSyncService.js"
import { ZzzSyncService } from "../src/gacha/zzzSyncService.js"
import { RecordStore } from "../src/storage/recordStore.js"

const CASES = Object.freeze([
  {
    game: "genshin",
    Service: GenshinSyncService,
    urlName: "XINGHAN_SMOKE_GENSHIN_URL",
    uidName: "XINGHAN_SMOKE_GENSHIN_UID",
  },
  {
    game: "starrail",
    Service: StarRailSyncService,
    urlName: "XINGHAN_SMOKE_STARRAIL_URL",
    uidName: "XINGHAN_SMOKE_STARRAIL_UID",
  },
  {
    game: "zzz",
    Service: ZzzSyncService,
    urlName: "XINGHAN_SMOKE_ZZZ_URL",
    uidName: "XINGHAN_SMOKE_ZZZ_UID",
  },
])

function usage() {
  return [
    "真实抽卡链接烟雾测试（不会打印或保存完整 URL/authkey）",
    "按需设置以下成对环境变量后运行 pnpm smoke:live：",
    "  XINGHAN_SMOKE_GENSHIN_URL / XINGHAN_SMOKE_GENSHIN_UID",
    "  XINGHAN_SMOKE_STARRAIL_URL / XINGHAN_SMOKE_STARRAIL_UID",
    "  XINGHAN_SMOKE_ZZZ_URL / XINGHAN_SMOKE_ZZZ_UID",
    "至少配置一组；测试完成后立即清除环境变量。",
  ].join("\n")
}

function maskUid(uid) {
  const value = String(uid)
  return value.length <= 4 ? "****" : `${"*".repeat(value.length - 4)}${value.slice(-4)}`
}

if (process.argv.includes("--help")) {
  console.log(usage())
  process.exit(0)
}

const selected = CASES.filter(entry => process.env[entry.urlName] || process.env[entry.uidName])
if (selected.length === 0) {
  console.error(usage())
  process.exit(2)
}
if (selected.some(entry => !process.env[entry.urlName] || !process.env[entry.uidName])) {
  console.error("每个测试游戏必须同时提供 URL 和 UID 环境变量。")
  process.exit(2)
}

const directory = await mkdtemp(path.join(os.tmpdir(), "xinghan-gacha-live-smoke-"))
let failed = false
try {
  for (const entry of selected) {
    const service = new entry.Service({
      credentialStore: { load: async () => undefined },
      authKeyClient: { generate: async () => { throw new Error("Unexpected authkey generation") } },
      authKeyCache: new MemoryAuthKeyCache(),
      gachaClient: new GachaApiClient(),
      recordStore: new RecordStore({ directory: path.join(directory, entry.game) }),
      pageDelayMs: 1_000,
    })
    try {
      const result = await service.syncImported(
        `live-smoke-${entry.game}`,
        process.env[entry.urlName],
        { uid: process.env[entry.uidName] },
      )
      const safe = {
        game: result.game,
        uid: maskUid(result.uid),
        market: result.market,
        added: result.added,
        total: result.total,
        pools: result.pools.map(pool => ({
          pool: pool.pool,
          pages: pool.pages,
          stopReason: pool.stopReason,
        })),
        errors: result.errors.map(error => ({ pool: error.pool, code: error.code })),
      }
      console.log(JSON.stringify(safe, null, 2))
      if (result.errors.length > 0) failed = true
    } catch (error) {
      failed = true
      console.error(JSON.stringify({ game: entry.game, code: String(error?.code ?? "UNKNOWN_ERROR") }))
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}

if (failed) process.exitCode = 1
