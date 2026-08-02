import plugin from "../../../lib/plugins/plugin.js"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"

import { privateOnly, publicErrorMessage } from "../src/adapters/yunzai/messages.js"
import { renderRecordImage } from "../src/adapters/yunzai/recordRenderer.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"
import { PLUGIN_REVISION } from "../src/version.js"

const GAMES = Object.freeze({
  genshin: "原神",
  starrail: "星铁",
  zzz: "绝区零",
})

function recordLog(level, message) {
  const output = globalThis.logger?.[level] ?? globalThis.logger?.info
  if (typeof output === "function") {
    output.call(globalThis.logger, `[xinghan-gacha-plugin/records] ${message}`)
  }
}

export class records extends plugin {
  constructor() {
    super({
      name: "三游戏抽卡记录图",
      dsc: "查看原神、星铁和绝区零抽卡记录图片",
      event: "message",
      priority: 1000,
      rule: [
        {
          reg: "^#(?:抽卡记录|原神抽卡记录|抽卡记录-查看原神抽卡记录|查看原神抽卡记录)$",
          fnc: "viewGenshin",
          log: true,
        },
        {
          reg: "^(?:\\*(?:抽卡记录|星铁抽卡记录|抽卡记录-查看(?:HSR|hsr|星铁)(?:的)?(?:抽卡记录)?)|#(?:抽卡记录-查看星铁抽卡记录|查看星铁抽卡记录))$",
          fnc: "viewStarRail",
          log: true,
        },
        {
          reg: "^(?:[%％](?:抽卡记录|绝区零抽卡记录|抽卡记录-查看(?:ZZZ|zzz|绝区零)(?:的)?(?:抽卡记录)?)|#(?:抽卡记录-查看绝区零抽卡记录|查看绝区零抽卡记录))$",
          fnc: "viewZzz",
          log: true,
        },
      ],
    })
  }

  async viewGame(game) {
    recordLog(
      "info",
      `命令已命中 revision=${PLUGIN_REVISION} game=${game} adapter=${String(this.e?.adapter_name ?? this.e?.adapter_id ?? "unknown")} private=${Boolean(this.e?.isPrivate)}`,
    )
    if (!privateOnly(this)) return true
    await this.reply(`正在生成${GAMES[game]}抽卡记录图，请稍候……`)
    try {
      const runtime = getYunzaiRuntime()
      const view = await runtime.recordViewService.get(String(this.e.user_id), game)
      await this.reply(await renderRecordImage(puppeteer, view))
    } catch (error) {
      recordLog(
        "warn",
        `生成失败 game=${game} code=${String(error?.code ?? "UNKNOWN_ERROR")} cause=${String(error?.causeName ?? error?.name ?? "Error")}`,
      )
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
