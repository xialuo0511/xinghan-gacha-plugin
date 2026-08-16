import QRCode from "qrcode"
import plugin from "../../../lib/plugins/plugin.js"

import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"
import {
  logMiaoSyncFailure,
  miaoSyncMessage,
  syncCredentialToMiao,
} from "../src/adapters/yunzai/miaoCredentialBridge.js"
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

  getLoginRuntime() {
    return getYunzaiRuntime()
  }

  syncMiaoCredential(event, credential) {
    return syncCredentialToMiao(event, credential)
  }

  async login() {
    if (!privateOnly(this)) return true
    const event = this.e
    const userId = String(event.user_id)
    const reply = event.reply.bind(event)
    try {
      const runtime = this.getLoginRuntime()
      await reply(
        "风险提示：本功能使用非官方接口，不收集账号密码。主密钥已配置时，登录成功后会把 Cookie 同步到 Yunzai/miao 用户库供面板调用；该上游用户库不会使用 HOYO_GACHA_MASTER_KEY 加密，请保护机器人数据目录。介意风险请停止操作。",
      )
      const started = await runtime.qrLoginService.start(userId)
      const image = await QRCode.toDataURL(started.url, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 360,
      })
      await reply(
        [globalThis.segment.image(image), "\n请使用米游社扫码并确认，二维码消息将在 120 秒后撤回。"],
        false,
        { recallMsg: 120 },
      )
      const result = await runtime.qrLoginService.poll(userId, {
        onStatus: async status => {
          if (status.state === "Scanned") await reply("二维码已扫描，请在米游社确认登录。")
        },
      })
      if (result.state !== "Confirmed") {
        await reply(result.state === "Cancelled" ? "扫码登录已取消。" : "二维码已过期，请重新扫码。")
        return true
      }
      const persistence =
        result.persistence === "encrypted-file"
          ? "凭据已加密保存。"
          : "未配置 HOYO_GACHA_MASTER_KEY，凭据仅保存在本次进程内存中。"
      let miaoSync
      if (result.persistence !== "encrypted-file") {
        miaoSync = { status: "primary-memory-only" }
      } else {
        try {
          const credential = await runtime.credentialStore.load(userId)
          miaoSync = await this.syncMiaoCredential(event, credential)
        } catch (error) {
          logMiaoSyncFailure(error)
          miaoSync = { status: "failed" }
        }
      }
      await reply(
        `登录成功。${persistence}\n${miaoSyncMessage(miaoSync)}\n${formatRoles(result.roles)}`,
      )
      return true
    } catch (error) {
      await reply(publicErrorMessage(error))
      return true
    }
  }

  async cancel() {
    if (!privateOnly(this)) return true
    const event = this.e
    const userId = String(event.user_id)
    const reply = event.reply.bind(event)
    try {
      const cancelled = await getYunzaiRuntime().qrLoginService.cancel(userId)
      await reply(cancelled ? "已取消当前扫码会话。" : "当前没有进行中的扫码会话。")
    } catch (error) {
      await reply(publicErrorMessage(error))
    }
    return true
  }
}
