import plugin from "../../../lib/plugins/plugin.js"

import { privateOnly, publicErrorMessage } from "../src/adapters/yunzai/messages.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"

function resultMessage(result) {
  const failed = result.errors.length ? `；${result.errors.length} 个池失败` : ""
  return `原神抽卡记录同步完成：新增 ${result.added} 条，本地共 ${result.total} 条${failed}。`
}

export class gacha extends plugin {
  constructor() {
    super({
      name: "原神抽卡记录",
      dsc: "更新或安全导入原神抽卡记录",
      event: "message",
      priority: 5000,
      rule: [
        { reg: "^#?更新原神抽卡记录$", fnc: "sync", log: false },
        {
          reg: "^#?导入原神抽卡URL(?:\\s+\\d{6,12})?\\s+https://\\S+$",
          fnc: "importUrl",
          log: false,
        },
      ],
    })
  }

  async sync() {
    if (!privateOnly(this)) return true
    try {
      const result = await getYunzaiRuntime().genshinSyncService.sync(String(this.e.user_id))
      await this.reply(resultMessage(result))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }

  async importUrl() {
    if (!privateOnly(this)) return true
    const source = String(this.e.msg)
    const match = source.match(/导入原神抽卡URL(?:\s+(\d{6,12}))?\s+(https:\/\/\S+)$/)
    const uid = match?.[1]
    const url = match?.[2]
    this.e.msg = "#导入原神抽卡URL [REDACTED]"
    this.e.raw_message = this.e.msg
    if (!url) {
      await this.reply("格式错误：#导入原神抽卡URL [UID] URL")
      return true
    }
    try {
      const result = await getYunzaiRuntime().genshinSyncService.syncImported(
        String(this.e.user_id),
        url,
        { uid },
      )
      await this.reply(resultMessage(result))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }
}
