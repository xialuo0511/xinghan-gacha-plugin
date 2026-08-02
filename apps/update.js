import plugin from "../../../lib/plugins/plugin.js"

import { publicErrorMessage } from "../src/adapters/yunzai/messages.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"

function formatLogs(logs) {
  if (!logs?.length) return "暂无可显示的提交记录。"
  return logs.map(log => `${log.id} [${log.date}] ${log.subject}`).join("\n")
}

export class update extends plugin {
  constructor() {
    super({
      name: "星瀚抽卡更新",
      dsc: "安全拉取 xinghan-gacha-plugin 更新并展示提交日志",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#?星瀚抽卡更新$",
          fnc: "update",
          permission: "master",
        },
        {
          reg: "^#?星瀚抽卡更新日志$",
          fnc: "logs",
          permission: "master",
        },
      ],
    })
  }

  async update() {
    if (!this.e?.isMaster) {
      await this.reply("只有机器人主人可以更新星瀚抽卡插件。", true)
      return true
    }
    await this.reply("正在检查并拉取星瀚抽卡插件更新，请稍候……")
    try {
      const result = await getYunzaiRuntime().updateService.update()
      if (!result.updated) {
        await this.reply(
          [`当前已经是最新版本（${result.after.slice(0, 7)}）。`, "最近提交：", formatLogs(result.logs)].join(
            "\n",
          ),
        )
        return true
      }

      const lines = [
        `星瀚抽卡插件更新成功：${result.before.slice(0, 7)} → ${result.after.slice(0, 7)}`,
        `分支：${result.branch}；本次更新 ${result.totalCommits} 个提交。`,
        "更新日志：",
        formatLogs(result.logs),
      ]
      if (result.totalCommits > result.logs.length) {
        lines.push(`另有 ${result.totalCommits - result.logs.length} 个较早提交未显示。`)
      }
      if (result.dependencyChanged) {
        lines.push("依赖清单已变化，请在插件目录执行 pnpm install。")
      }
      lines.push("请重启 TRSS-Yunzai 以应用新版本。")
      await this.reply(lines.join("\n"))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }

  async logs() {
    if (!this.e?.isMaster) {
      await this.reply("只有机器人主人可以查看星瀚抽卡插件更新日志。", true)
      return true
    }
    try {
      const result = await getYunzaiRuntime().updateService.recent(20)
      await this.reply(["星瀚抽卡插件最近更新日志：", formatLogs(result.logs)].join("\n"))
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }
}
