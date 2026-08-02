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
        "xinghan-gacha-plugin 里程碑 0-4 已实现。",
        "已实现：安全 URL 解析、国服扫码与角色发现、三游戏全池增量同步。",
        "尚未完成：UIGF 导出、旧数据迁移和真实账号验收。",
      ].join("\n"),
    )
  }
}
