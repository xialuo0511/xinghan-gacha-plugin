import plugin from "../../../lib/plugins/plugin.js"

import { formatRoles, privateOnly } from "../src/adapters/yunzai/messages.js"
import {
  logMiaoSyncFailure,
  miaoSyncMessage,
  syncCredentialToMiao,
} from "../src/adapters/yunzai/miaoCredentialBridge.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"

const GAME_NAMES = Object.freeze({ 原神: "genshin", 星铁: "starrail", 绝区零: "zzz" })

export class account extends plugin {
  constructor() {
    super({
      name: "米游社游戏角色",
      dsc: "查看、选择角色和撤销授权",
      event: "message",
      priority: 5000,
      rule: [
        { reg: "^#?我的游戏角色$", fnc: "roles", log: false },
        { reg: "^#?选择(?:原神|星铁|绝区零)\\s+\\d+$", fnc: "select", log: false },
        { reg: "^#?同步米游社(?:[Cc]ookie|[Cc][Kk])$", fnc: "syncMiao", log: false },
        { reg: "^#?删除米游社授权(?:\\s+确认)?$", fnc: "revoke", log: false },
      ],
    })
  }

  async syncMiao() {
    if (!privateOnly(this)) return true
    const event = this.e
    const userId = String(event.user_id)
    const reply = event.reply.bind(event)
    const runtime = getYunzaiRuntime()
    try {
      const credential = await runtime.credentialStore.load(userId)
      if (!credential) {
        await reply("尚未绑定米游社授权，请先发送 #扫码登录。")
        return true
      }
      if (!runtime.credentialStore.persistent) {
        await reply(miaoSyncMessage({ status: "primary-memory-only" }))
        return true
      }
      const result = await syncCredentialToMiao(event, credential)
      await reply(miaoSyncMessage(result))
    } catch (error) {
      logMiaoSyncFailure(error)
      await reply(miaoSyncMessage({ status: "failed" }))
    }
    return true
  }

  async roles() {
    if (!privateOnly(this)) return true
    const credential = await getYunzaiRuntime().credentialStore.load(String(this.e.user_id))
    await this.reply(
      credential
        ? formatRoles(credential.roles, credential.selectedRoles)
        : "尚未绑定米游社授权，请发送 #扫码登录。",
    )
    return true
  }

  async select() {
    if (!privateOnly(this)) return true
    const match = this.e.msg.match(/选择(原神|星铁|绝区零)\s+(\d+)/)
    const game = GAME_NAMES[match?.[1]]
    const uid = match?.[2]
    const runtime = getYunzaiRuntime()
    const credential = await runtime.credentialStore.load(String(this.e.user_id))
    const role = credential?.roles?.find(item => item.game === game && item.uid === uid)
    if (!role) {
      await this.reply("未找到该角色，请先发送 #我的游戏角色 检查 UID。")
      return true
    }
    credential.selectedRoles = { ...credential.selectedRoles, [game]: uid }
    const saved = await runtime.credentialStore.save(String(this.e.user_id), credential)
    await this.reply(
      `已选择${match[1]}角色 ${uid}。${saved.persistence === "memory" ? "当前为仅内存保存。" : ""}`,
    )
    return true
  }

  async revoke() {
    if (!privateOnly(this)) return true
    if (!/\s确认$/.test(this.e.msg)) {
      await this.reply(
        "此操作会删除星瀚插件的登录凭据，但不会删除本地抽卡历史或 Yunzai/miao Cookie；后者请另用 #删除ck。请发送：#删除米游社授权 确认",
      )
      return true
    }
    const runtime = getYunzaiRuntime()
    await runtime.credentialStore.delete(String(this.e.user_id))
    runtime.authKeyCache.deleteUser(String(this.e.user_id))
    await this.reply("星瀚插件中的米游社授权已删除；本地抽卡历史与 Yunzai/miao Cookie 未删除。")
    return true
  }
}
