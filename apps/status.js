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
        "xinghan-gacha-plugin 里程碑 0-2 已实现。",
        "已实现：安全 URL 解析、国服扫码与角色发现、原神五池增量同步。",
        "尚未完成：星铁/绝区零同步、UIGF 导出和真实账号验收。",
      ].join("\n"),
    )
  }
}
