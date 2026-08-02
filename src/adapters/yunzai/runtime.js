import path from "node:path"

import { CredentialExchangeClient } from "../../auth/credentialExchange.js"
import { QrLoginClient } from "../../auth/qrLoginClient.js"
import { QrLoginService } from "../../auth/qrLoginService.js"
import { RedisQrSessionStore } from "../../auth/qrSessionStore.js"
import { RoleDiscoveryClient } from "../../auth/roleDiscovery.js"
import { CredentialStore } from "../../storage/credentialStore.js"
import { MemoryAuthKeyCache } from "../../auth/authKeyCache.js"
import { AuthKeyClient } from "../../auth/authKeyClient.js"
import { GachaApiClient } from "../../gacha/gachaApiClient.js"
import { GenshinSyncService } from "../../gacha/genshinSyncService.js"
import { StarRailSyncService } from "../../gacha/starRailSyncService.js"
import { ZzzSyncService } from "../../gacha/zzzSyncService.js"
import { RecordStore } from "../../storage/recordStore.js"
import { ExportStore } from "../../storage/exportStore.js"
import { UigfService } from "../../export/uigfService.js"
import { GitUpdateService } from "../../update/gitUpdateService.js"

let runtime

export function getYunzaiRuntime() {
  if (runtime) return runtime
  if (!globalThis.redis) throw new Error("TRSS Redis is unavailable")

  const pluginRoot = path.join(process.cwd(), "plugins", "xinghan-gacha-plugin")
  const credentialStore = new CredentialStore({
    directory: path.join(pluginRoot, "data", "credentials"),
  })
  const qrLoginService = new QrLoginService({
    client: new QrLoginClient(),
    sessionStore: new RedisQrSessionStore(globalThis.redis),
    credentialExchange: new CredentialExchangeClient(),
    roleDiscovery: new RoleDiscoveryClient(),
    credentialStore,
  })
  const authKeyCache = new MemoryAuthKeyCache()
  const recordStore = new RecordStore({
    directory: path.join(pluginRoot, "data", "records"),
  })
  const exportStore = new ExportStore({
    directory: path.join(pluginRoot, "data", "exports"),
  })
  const updateService = new GitUpdateService({ directory: pluginRoot })
  const uigfService = new UigfService({
    credentialStore,
    recordStore,
    appVersion: "0.1.0",
  })
  const syncDependencies = {
    credentialStore,
    authKeyClient: new AuthKeyClient(),
    authKeyCache,
    gachaClient: new GachaApiClient(),
    recordStore,
  }
  const genshinSyncService = new GenshinSyncService(syncDependencies)
  const starRailSyncService = new StarRailSyncService(syncDependencies)
  const zzzSyncService = new ZzzSyncService(syncDependencies)
  const syncServices = Object.freeze({
    genshin: genshinSyncService,
    starrail: starRailSyncService,
    zzz: zzzSyncService,
  })
  runtime = Object.freeze({
    credentialStore,
    qrLoginService,
    authKeyCache,
    recordStore,
    exportStore,
    uigfService,
    updateService,
    genshinSyncService,
    starRailSyncService,
    zzzSyncService,
    syncServices,
  })
  return runtime
}

export function resetYunzaiRuntimeForTest() {
  runtime = undefined
}
