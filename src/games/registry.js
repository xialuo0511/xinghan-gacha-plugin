import { genshin } from "./genshin.js"
import { starrail } from "./starRail.js"
import { zzz } from "./zzz.js"

export const GAME_ADAPTERS = Object.freeze({ genshin, starrail, zzz })

export function getGameAdapter(game) {
  const adapter = GAME_ADAPTERS[game]
  if (!adapter) throw new RangeError("Unsupported game")
  return adapter
}

export function compareRecordIds(left, right) {
  const a = BigInt(String(left))
  const b = BigInt(String(right))
  return a === b ? 0 : a < b ? -1 : 1
}
