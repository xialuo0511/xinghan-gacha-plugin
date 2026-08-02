import plugin from "../../../lib/plugins/plugin.js"

const HELP = [
  "星瀚抽卡记录帮助",
  "",
  "一、账号与角色（请私聊）",
  "#扫码登录｜#取消扫码登录",
  "#我的游戏角色",
  "#选择原神 UID｜#选择星铁 UID｜#选择绝区零 UID",
  "#删除米游社授权｜#删除米游社授权 确认",
  "",
  "二、更新记录（请私聊）",
  "#更新原神抽卡记录｜#更新星铁抽卡记录｜#更新绝区零抽卡记录",
  "#更新全部抽卡记录",
  "国际服或扫码不可用时：",
  "#导入原神抽卡URL [UID] URL",
  "#导入星铁抽卡URL [UID] URL",
  "#导入绝区零抽卡URL [UID] URL",
  "若已选择对应角色，URL 命令可省略 UID。",
  "",
  "三、备份与迁移（请私聊）",
  "#导出抽卡记录 —— 导出不含登录凭据的 UIGF v4.1 JSON",
  "#导入抽卡记录 {JSON} —— 支持 UIGF v4.x、旧版 UIGF 和 SRGF",
  "导入前须已有相同游戏 UID；重复导入会自动去重。",
  "UIGF 标准：https://uigf.org/zh/standards/uigf.html",
  "",
  "四、其他",
  "#抽卡插件状态｜#星瀚抽卡帮助",
  "主人命令：#星瀚抽卡更新｜#星瀚抽卡更新日志",
  "更新只接受官方仓库的干净工作区和快进提交；完成后请重启机器人。",
  "首次使用：私聊扫码登录 → 查看角色 → 选择角色 → 更新记录。",
  "管理员应配置 HOYO_GACHA_MASTER_KEY；完整抽卡 URL 不要发到群聊。",
].join("\n")

export class help extends plugin {
  constructor() {
    super({
      name: "星瀚抽卡帮助",
      dsc: "展示 xinghan-gacha-plugin 全部命令与使用指引",
      event: "message",
      priority: 5000,
      rule: [{ reg: "^#?(?:星瀚)?抽卡帮助$", fnc: "help" }],
    })
  }

  async help() {
    return this.reply(HELP)
  }
}
