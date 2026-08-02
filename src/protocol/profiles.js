function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export const PROTOCOL_PROFILES = deepFreeze({
  gachaQuery: {
    authkeyVer: "1",
    signType: "2",
    authAppid: "webview_gacha",
    defaultLanguage: "zh-cn",
    pageSize: "20",
  },
  communityCn: {
    status: "observed-needs-live-smoke-test",
    sourceRevision: "e7ab3e8b276a11680beb47d0c5517f6e0a4c2022",
    observedAt: "2026-05-31",
    appVersion: "2.70.1",
    qr: {
      appId: "bll8iq97cem8",
      appVersion: "2.70.1",
      clientType: "2",
      gameBiz: "bbs_cn",
      systemVersion: "11",
      sdkVersion: "1.3.1.2",
      channel: "appstore",
      userAgent: "okhttp/4.8.0",
      deviceFp: "38d7ee0e96649",
      dsSalt: "JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS",
    },
    roles: {
      appVersion: "2.70.1",
      clientType: "5",
      channel: "appstore",
      dsSalt: "sjdNFJB7XxyDWGIAk0eTV8AOCfMJmyEo",
    },
    authKey: {
      appVersion: "2.70.1",
      clientType: "5",
      channel: "mihoyo",
      systemVersion: "12",
      dsSalt: "sjdNFJB7XxyDWGIAk0eTV8AOCfMJmyEo",
    },
    note: "常量来自公开实现快照；首次真实使用前仍需测试账号烟雾验证。",
  },
  hoyolabGlobal: {
    status: "not-implemented",
    updatedAt: null,
    appVersion: null,
    clientType: null,
    dsSalt: null,
    note: "国际服登录与 Cookie 换取尚未实现。",
  },
})
