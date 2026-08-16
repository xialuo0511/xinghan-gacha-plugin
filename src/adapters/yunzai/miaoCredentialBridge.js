const GAME_KEYS = Object.freeze({
  genshin: "gs",
  starrail: "sr",
  zzz: "zzz",
})

let bridgeWriteTail = Promise.resolve()

function safeCookieValue(value, name) {
  const text = String(value ?? "")
  if (!text || /[;\r\n]/.test(text)) {
    const error = new Error(`Invalid credential field: ${name}`)
    error.code = "MIAO_CREDENTIAL_INVALID"
    throw error
  }
  return text
}

function supportsMiaoBinding(event) {
  return Boolean(
    event?.runtime?.MysUser?.create &&
      event?.runtime?.NoteUser?.create,
  )
}

function supportsMysUserModel(mysUser) {
  return Boolean(
    mysUser?.setCkData &&
      mysUser?.addUid &&
      mysUser?.save &&
      mysUser?.initCache,
  )
}

function supportsNoteUserModel(noteUser) {
  return Boolean(noteUser?.addMysUser && noteUser?.save)
}

export function buildMiaoCookie(credential) {
  const accountId = safeCookieValue(credential?.accountId, "accountId")
  if (!/^\d{4,10}$/.test(accountId)) {
    const error = new Error("Miao-Yunzai requires a numeric account id")
    error.code = "MIAO_ACCOUNT_ID_UNSUPPORTED"
    throw error
  }

  const mid = safeCookieValue(credential?.mid, "mid")
  const stoken = safeCookieValue(credential?.stoken, "stoken")
  const cookieToken = safeCookieValue(credential?.cookieToken, "cookieToken")
  const stokenName = credential?.stokenName === "stoken_v2" ? "stoken_v2" : "stoken"
  return [
    `stuid=${accountId}`,
    `ltuid=${accountId}`,
    `account_id=${accountId}`,
    `mid=${mid}`,
    `${stokenName}=${stoken}`,
    `cookie_token=${cookieToken}`,
  ].join(";") + ";"
}

async function withBridgeWriteLock(task) {
  const previous = bridgeWriteTail
  let release
  const current = new Promise(resolve => {
    release = resolve
  })
  bridgeWriteTail = current
  await previous.catch(() => {})
  try {
    return await task()
  } finally {
    release()
    if (bridgeWriteTail === current) bridgeWriteTail = Promise.resolve()
  }
}

function roleProjection(credential) {
  const byGame = new Map()
  const main = new Map()
  for (const role of credential.roles ?? []) {
    const game = GAME_KEYS[role?.game]
    const uid = String(role?.uid ?? "")
    if (!game || !/^\d{8,10}$/.test(uid)) continue
    if (!byGame.has(game)) byGame.set(game, new Set())
    byGame.get(game).add(uid)
    if (credential.selectedRoles?.[role.game] === uid || !main.has(game)) main.set(game, uid)
  }
  return { byGame, main }
}

function mainUidUpdates(noteUser, roleUids, accountId) {
  const result = new Map()
  if (!noteUser?.getUid || !noteUser?.getUidData || !noteUser?.setMainUid) return result
  for (const [game, uid] of roleUids) {
    const currentUid = String(noteUser.getUid(game) ?? "")
    const currentData = currentUid ? noteUser.getUidData(currentUid, game) : undefined
    const currentAccountId = String(currentData?.ltuid ?? "")
    if (
      !currentUid ||
      currentData?.type !== "ck" ||
      (currentAccountId === accountId && currentUid !== uid)
    ) {
      result.set(game, uid)
    }
  }
  return result
}

async function syncCredentialToMiaoUnlocked(event, credential, accountId, cookie) {
  const roles = roleProjection(credential)
  if (roles.byGame.size === 0) return Object.freeze({ status: "no-roles" })

  if (!supportsMiaoBinding(event)) {
    return Object.freeze({ status: "unavailable" })
  }
  if (!credential?.cookieToken) {
    return Object.freeze({ status: "credential-incomplete" })
  }

  const mysUser = await event.runtime.MysUser.create(accountId)
  const noteUser = await event.runtime.NoteUser.create(event)
  if (!supportsMysUserModel(mysUser) || !supportsNoteUserModel(noteUser)) {
    return Object.freeze({ status: "unavailable" })
  }
  const mainUpdates = mainUidUpdates(noteUser, roles.main, accountId)

  // QrLoginService has already validated this Cookie while discovering these
  // roles. Reuse that bounded result instead of invoking upstream reqMysUid(),
  // whose fetch has no cancellation or timeout in current Yunzai versions.
  mysUser.setCkData({
    ck: cookie,
    type: "mys",
  })

  const games = new Set()
  for (const [game, uids] of roles.byGame) {
    for (const uid of uids) mysUser.addUid(uid, game)
    games.add(game)
  }

  await mysUser.save()
  await noteUser.addMysUser(mysUser)
  for (const [game, uid] of mainUpdates) noteUser.setMainUid(uid, game, false)
  // Some upstream versions start a save in addMysUser without awaiting it.
  // Awaiting save explicitly makes the bridge deterministic across versions.
  await noteUser.save()

  let cacheReady = true
  try {
    await mysUser.initCache()
  } catch {
    cacheReady = false
  }

  return Object.freeze({
    status: "synced",
    cacheReady,
    games: Object.freeze([...games]),
  })
}

export async function syncCredentialToMiao(event, credential) {
  if (!supportsMiaoBinding(event)) return Object.freeze({ status: "unavailable" })
  if (!credential?.cookieToken) return Object.freeze({ status: "credential-incomplete" })
  const cookie = buildMiaoCookie(credential)
  const accountId = safeCookieValue(credential.accountId, "accountId")
  // NoteUser may resolve multiple adapter identities to the same primary bot
  // user. Serialize all bridge writes so different HoYo accounts cannot race
  // while updating that shared Users row.
  return withBridgeWriteLock(() =>
    syncCredentialToMiaoUnlocked(event, credential, accountId, cookie),
  )
}

export function miaoSyncMessage(result) {
  switch (result?.status) {
    case "synced":
      return result.cacheReady
        ? "米游社 Cookie 已同步到 Yunzai/miao 用户库，可直接使用 #米游社更新面板。"
        : "米游社 Cookie 已写入 Yunzai/miao 用户库；缓存刷新失败，请重启 TRSS-Yunzai 后再使用 #米游社更新面板。"
    case "credential-incomplete":
      return "本次凭据缺少 cookie_token，尚未同步到 miao；请重新扫码。"
    case "no-roles":
      return "未发现可绑定的游戏角色，尚未同步到 miao；请确认米游社账号已绑定角色后重新扫码。"
    case "primary-memory-only":
      return "未同步到 Yunzai/miao：请先配置 HOYO_GACHA_MASTER_KEY 并重启机器人，再重新扫码。"
    case "unavailable":
      return "未检测到 Yunzai 的米游社 Cookie 绑定接口；抽卡登录已完成，但 miao 面板尚未绑定。请安装或更新 genshin 与 miao-plugin 后重新扫码。"
    default:
      return "抽卡登录已完成，但同步 Yunzai/miao Cookie 失败；请管理员查看脱敏日志后重新扫码。"
  }
}

export function logMiaoSyncFailure(error) {
  const rawCode = String(error?.code ?? "")
  const code = /^MIAO_[A-Z0-9_]{1,58}$/.test(rawCode) ? rawCode : "MIAO_SYNC_FAILED"
  const type = String(error?.constructor?.name ?? "Error")
    .replace(/[^A-Z0-9_-]/gi, "")
    .slice(0, 64) || "Error"
  globalThis.logger?.warn?.(
    `[xinghan-gacha-plugin/miao] Cookie 同步失败 code=${code} type=${type}`,
  )
}
