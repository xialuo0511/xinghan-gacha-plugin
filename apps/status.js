import plugin from "../../../lib/plugins/plugin.js"

export class status extends plugin {
  constructor() {
    super({
      name: "米游社抽卡插件状态",
      dsc: "查看 xinghan-gacha-plugin 当前实现状态",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#?(?:hoyo|米游社)?抽卡插件状态$",
          fnc: "status",
        },
      ],
    })
  }

  async status() {
    return this.reply(
      [
        "xinghan-gacha-plugin 里程碑 0-6 已实现。",
        "已实现：安全 URL、扫码登录、三游戏增量同步、记录截图、UIGF v4.1 导入导出与旧格式迁移。",
        "阶段 6：自动化与实测清单已就绪；真实账号、区服、Puppeteer 截图和异常场景仍需逐项验收。",
        "主人可发送 #星瀚抽卡更新 安全拉取仓库更新；发送 #星瀚抽卡帮助 查看所有命令。",
      ].join("\n"),
    )
  }
}
