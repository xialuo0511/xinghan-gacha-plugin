import plugin from "../../../lib/plugins/plugin.js"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"

import { privateOnly, publicErrorMessage } from "../src/adapters/yunzai/messages.js"
import { renderRecordImage } from "../src/adapters/yunzai/recordRenderer.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"

const GAMES = Object.freeze({
  genshin: "原神",
  starrail: "星铁",
  zzz: "绝区零",
})

export class records extends plugin {
  constructor() {
    super({
      name: "三游戏抽卡记录图",
      dsc: "使用差异化命令查看原神、星铁和绝区零抽卡记录",
      event: "message",
      priority: 5000,
      rule: [
        { reg: "^#抽卡记录-查看原神抽卡记录$", fnc: "viewGenshin", log: false },
        { reg: "^\\*抽卡记录-查看(?:HSR|hsr|星铁)(?:的)?$", fnc: "viewStarRail", log: false },
        { reg: "^%抽卡记录-查看(?:ZZZ|zzz|绝区零)(?:的)?$", fnc: "viewZzz", log: false },
      ],
    })
  }

  async viewGame(game) {
    if (!privateOnly(this)) return true
    await this.reply(`正在生成${GAMES[game]}抽卡记录图，请稍候……`)
    try {
      const runtime = getYunzaiRuntime()
      const view = await runtime.recordViewService.get(String(this.e.user_id), game)
      await this.reply(await renderRecordImage(puppeteer, view))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }

  viewGenshin() {
    return this.viewGame("genshin")
  }

  viewStarRail() {
    return this.viewGame("starrail")
  }

  viewZzz() {
    return this.viewGame("zzz")
  }
}
