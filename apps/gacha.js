import plugin from "../../../lib/plugins/plugin.js"

import { privateOnly, publicErrorMessage } from "../src/adapters/yunzai/messages.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"

const GAMES = Object.freeze({
  genshin: Object.freeze({ name: "原神", service: "genshinSyncService" }),
  starrail: Object.freeze({ name: "星铁", service: "starRailSyncService" }),
  zzz: Object.freeze({ name: "绝区零", service: "zzzSyncService" }),
})
const GAME_ORDER = Object.freeze(["genshin", "starrail", "zzz"])

function resultMessage(result) {
  const failed = result.errors.length ? `；${result.errors.length} 个池失败` : ""
  return `${GAMES[result.game].name}抽卡记录同步完成：新增 ${result.added} 条，本地共 ${result.total} 条${failed}。`
}

function importParts(message, game) {
  const name = GAMES[game].name
  return String(message).match(new RegExp(`导入${name}抽卡URL(?:\\s+(\\d{6,12}))?\\s+(https:\\/\\/\\S+)$`))
}

function redactImportEvent(event, game) {
  event.msg = `#导入${GAMES[game].name}抽卡URL [REDACTED]`
  event.raw_message = event.msg
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export class gacha extends plugin {
  constructor() {
    super({
      name: "三游戏抽卡记录",
      dsc: "更新或安全导入三游戏抽卡记录",
      event: "message",
      priority: 5000,
      rule: [
        { reg: "^#?更新原神抽卡记录$", fnc: "syncGenshin", log: false },
        { reg: "^#?更新星铁抽卡记录$", fnc: "syncStarRail", log: false },
        { reg: "^#?更新绝区零抽卡记录$", fnc: "syncZzz", log: false },
        { reg: "^#?更新全部抽卡记录$", fnc: "syncAll", log: false },
        {
          reg: "^#?导入原神抽卡URL(?:\\s+\\d{6,12})?\\s+https://\\S+$",
          fnc: "importGenshinUrl",
          log: false,
        },
        {
          reg: "^#?导入星铁抽卡URL(?:\\s+\\d{6,12})?\\s+https://\\S+$",
          fnc: "importStarRailUrl",
          log: false,
        },
        {
          reg: "^#?导入绝区零抽卡URL(?:\\s+\\d{6,12})?\\s+https://\\S+$",
          fnc: "importZzzUrl",
          log: false,
        },
      ],
    })
  }

  async syncGame(game) {
    if (!privateOnly(this)) return true
    try {
      const runtime = getYunzaiRuntime()
      const result = await runtime[GAMES[game].service].sync(String(this.e.user_id))
      await this.reply(resultMessage(result))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }

  syncGenshin() {
    return this.syncGame("genshin")
  }

  syncStarRail() {
    return this.syncGame("starrail")
  }

  syncZzz() {
    return this.syncGame("zzz")
  }

  async syncAll() {
    if (!privateOnly(this)) return true
    const runtime = getYunzaiRuntime()
    const messages = []
    for (const [index, game] of GAME_ORDER.entries()) {
      try {
        const result = await runtime[GAMES[game].service].sync(String(this.e.user_id))
        messages.push(resultMessage(result))
      } catch (error) {
        messages.push(`${GAMES[game].name}：${publicErrorMessage(error)}`)
      }
      if (index + 1 < GAME_ORDER.length) await delay(800 + Math.floor(Math.random() * 401))
    }
    await this.reply(messages.join("\n"))
    return true
  }

  async importGameUrl(game) {
    if (!privateOnly(this)) return true
    const match = importParts(this.e.msg, game)
    const uid = match?.[1]
    const url = match?.[2]
    redactImportEvent(this.e, game)
    if (!url) {
      await this.reply(`格式错误：#导入${GAMES[game].name}抽卡URL [UID] URL`)
      return true
    }
    try {
      const runtime = getYunzaiRuntime()
      const result = await runtime[GAMES[game].service].syncImported(String(this.e.user_id), url, {
        uid,
      })
      await this.reply(resultMessage(result))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }

  importGenshinUrl() {
    return this.importGameUrl("genshin")
  }

  importStarRailUrl() {
    return this.importGameUrl("starrail")
  }

  importZzzUrl() {
    return this.importGameUrl("zzz")
  }
}
