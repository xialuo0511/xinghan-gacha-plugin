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
import { RecordStore } from "../../storage/recordStore.js"

let runtime

export function getYunzaiRuntime() {
  if (runtime) return runtime
  if (!globalThis.redis) throw new Error("TRSS Redis is unavailable")

  const credentialStore = new CredentialStore({
    directory: path.join(process.cwd(), "plugins", "xinghan-gacha-plugin", "data", "credentials"),
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
    directory: path.join(process.cwd(), "plugins", "xinghan-gacha-plugin", "data", "records"),
  })
  const genshinSyncService = new GenshinSyncService({
    credentialStore,
    authKeyClient: new AuthKeyClient(),
    authKeyCache,
    gachaClient: new GachaApiClient(),
    recordStore,
  })
  runtime = Object.freeze({
    credentialStore,
    qrLoginService,
    authKeyCache,
    recordStore,
    genshinSyncService,
  })
  return runtime
}

export function resetYunzaiRuntimeForTest() {
  runtime = undefined
}
