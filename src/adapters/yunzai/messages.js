const PUBLIC_ERRORS = Object.freeze({
  QR_SESSION_EXISTS: "已有扫码会话，请先完成或发送 #取消扫码登录。",
  QR_SESSION_LOST: "扫码会话已过期，请重新发送 #扫码登录。",
  QR_CANCELLED: "扫码登录已取消。",
  NETWORK_ERROR: "连接米游社失败，请稍后重试。",
  HTTP_ERROR: "米游社接口暂时不可用，请稍后重试。",
  REMOTE_ERROR: "米游社拒绝了请求，协议可能已变化。",
  INVALID_JSON: "米游社返回了无法识别的数据。",
  UNTRUSTED_QR_URL: "米游社返回了不受信任的二维码地址，已停止登录。",
  AUTHORIZATION_REQUIRED: "尚未登录，请先发送 #扫码登录。",
  ROLE_REQUIRED: "尚未选择原神角色，请发送 #我的游戏角色 后选择。",
  UID_REQUIRED: "没有已选角色，导入时请使用：#导入原神抽卡URL UID URL",
  WRONG_GAME_URL: "该链接不是原神抽卡链接。",
  IMPORTED_ROLE_MISMATCH: "链接区服与所选原神角色不一致。",
  SYNC_IN_PROGRESS: "该角色已有同步任务正在进行。",
  AUTHKEY_EXPIRED: "抽卡链接中的 authkey 已过期，请重新获取链接。",
  RATE_LIMITED: "访问过于频繁，请稍后重试。",
  UNTRUSTED_ENDPOINT: "抽卡链接域名或路径不在白名单中。",
  HTTPS_REQUIRED: "抽卡链接必须使用 HTTPS。",
})

export function publicErrorMessage(error) {
  return PUBLIC_ERRORS[error?.code] ?? "操作失败，请检查配置或稍后重试。"
}

export function privateOnly(app) {
  if (app.e?.isPrivate) return true
  app.reply("该操作包含账号信息，请私聊机器人使用。", true)
  return false
}

export function formatRoles(roles, selectedRoles = {}) {
  if (!roles?.length) return "未发现已绑定的游戏角色。"
  return roles
    .map(role => {
      const selected = selectedRoles[role.game] === role.uid ? "（当前）" : ""
      return `${role.game === "genshin" ? "原神" : role.game === "starrail" ? "星铁" : "绝区零"} ${role.uid} ${role.regionName}${selected}`
    })
    .join("\n")
}
