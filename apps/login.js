import QRCode from "qrcode"
import plugin from "../../../lib/plugins/plugin.js"

import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"
import {
  formatRoles,
  privateOnly,
  publicErrorMessage,
} from "../src/adapters/yunzai/messages.js"

export class login extends plugin {
  constructor() {
    super({
      name: "米游社扫码登录",
      dsc: "通过米游社二维码发现游戏角色",
      event: "message",
      priority: 5000,
      rule: [
        { reg: "^#?(?:米游社)?扫码登录$", fnc: "login", log: false },
        { reg: "^#?取消扫码登录$", fnc: "cancel", log: false },
      ],
    })
  }

  async login() {
    if (!privateOnly(this)) return true
    const userId = String(this.e.user_id)
    try {
      const runtime = getYunzaiRuntime()
      await this.reply(
        "风险提示：本功能使用非官方接口，仅获取抽卡记录所需授权，不收集账号密码。接口可能变化；介意风险请停止操作。",
      )
      const started = await runtime.qrLoginService.start(userId)
      const image = await QRCode.toDataURL(started.url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      })
      await this.reply(
        [globalThis.segment.image(image), "\n请使用米游社扫码并确认，二维码消息将在 120 秒后撤回。"],
        false,
        { recallMsg: 120 },
      )
      const result = await runtime.qrLoginService.poll(userId, {
        onStatus: async status => {
          if (status.state === "Scanned") await this.reply("二维码已扫描，请在米游社确认登录。")
        },
      })
      if (result.state !== "Confirmed") {
        await this.reply(result.state === "Cancelled" ? "扫码登录已取消。" : "二维码已过期，请重新扫码。")
        return true
      }
      const persistence =
        result.persistence === "encrypted-file"
          ? "凭据已加密保存。"
          : "未配置 HOYO_GACHA_MASTER_KEY，凭据仅保存在本次进程内存中。"
      await this.reply(`登录成功。${persistence}\n${formatRoles(result.roles)}`)
      return true
    } catch (error) {
      await this.reply(publicErrorMessage(error))
      return true
    }
  }

  async cancel() {
    if (!privateOnly(this)) return true
    try {
      const cancelled = await getYunzaiRuntime().qrLoginService.cancel(String(this.e.user_id))
      await this.reply(cancelled ? "已取消当前扫码会话。" : "当前没有进行中的扫码会话。")
    } catch (error) {
      await this.reply(publicErrorMessage(error))
    }
    return true
  }
}
