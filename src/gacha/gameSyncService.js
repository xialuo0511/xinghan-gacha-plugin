import { getGameAdapter } from "../games/registry.js"
import { ProtocolError } from "../protocol/http.js"
import { paginateGachaPool } from "./paginator.js"
import { parseGachaUrl } from "./urlParser.js"

function selectedRole(credential, game, requestedUid) {
  const uid = requestedUid ?? credential?.selectedRoles?.[game]
  if (!uid) return undefined
  return credential?.roles?.find(role => role.game === game && role.uid === String(uid))
}

function importedRole(game, uid, parsed) {
  if (!uid) return undefined
  return {
    game,
    uid: String(uid),
    gameBiz: parsed.gameBiz,
    region: parsed.region,
  }
}

export class GameSyncService {
  constructor({
    game,
    credentialStore,
    authKeyClient,
    authKeyCache,
    gachaClient,
    recordStore,
    pageDelayMs = 800,
    sleep,
    random,
  }) {
    getGameAdapter(game)
    Object.assign(this, {
      game,
      credentialStore,
      authKeyClient,
      authKeyCache,
      gachaClient,
      recordStore,
      pageDelayMs,
      sleep,
      random,
    })
    this.active = new Set()
  }

  async sync(userId, { uid, signal } = {}) {
    const credential = await this.credentialStore.load(userId)
    if (!credential) throw new ProtocolError("AUTHORIZATION_REQUIRED", "Login authorization is required")
    const role = selectedRole(credential, this.game, uid)
    if (!role) throw new ProtocolError("ROLE_REQUIRED", "A game role must be selected")
    return this.syncRole({ userId, role, credential, signal })
  }

  async syncImported(userId, rawUrl, { uid, signal } = {}) {
    const parsed = parseGachaUrl(rawUrl)
    if (parsed.game !== this.game) {
      throw new ProtocolError("WRONG_GAME_URL", "Imported URL belongs to another game")
    }
    const credential = await this.credentialStore.load(userId)
    const role = selectedRole(credential, this.game, uid) ?? importedRole(this.game, uid, parsed)
    if (!role) {
      throw new ProtocolError("UID_REQUIRED", "A UID is required when no matching role is selected")
    }
    if (role.gameBiz !== parsed.gameBiz || role.region !== parsed.region) {
      throw new ProtocolError("IMPORTED_ROLE_MISMATCH", "Imported URL does not match the selected role")
    }
    return this.syncRole({ userId, role, credential, parsed, signal })
  }

  async syncRole({ userId, role, credential, parsed, signal }) {
    const lockKey = `${String(userId)}:${role.gameBiz}:${role.uid}`
    if (this.active.has(lockKey)) {
      throw new ProtocolError("SYNC_IN_PROGRESS", "A sync is already running for this role")
    }
    this.active.add(lockKey)
    try {
      return await this.performSync({ userId, role, credential, parsed, signal })
    } finally {
      this.active.delete(lockKey)
    }
  }

  async performSync({ userId, role, credential, parsed, signal }) {
    const adapter = getGameAdapter(this.game)
    const market = adapter.marketForRegion(role.region)
    if (!market) throw new ProtocolError("UNSUPPORTED_REGION", "Game role region is unsupported")
    if (!parsed && market !== "cn") {
      throw new ProtocolError("URL_IMPORT_REQUIRED", "Global roles require a trusted imported URL")
    }

    const existing = await this.recordStore.load(role)
    const knownIds = new Set(existing.map(record => record.id))
    const pendingIds = new Set()
    const pending = []
    const poolResults = []
    const errors = []
    let refreshed = false

    let authkey = parsed?.authkey ?? this.authKeyCache.get(userId, role)
    if (!authkey) {
      authkey = await this.authKeyClient.generate(credential, role, { signal })
      this.authKeyCache.set(userId, role, authkey)
    }

    const auth = () => ({
      authkey,
      gameBiz: role.gameBiz,
      region: role.region,
      lang: parsed?.lang ?? "zh-cn",
    })

    for (const pool of adapter.pools) {
      const runPool = () =>
        paginateGachaPool({
          fetchPage: cursor =>
            this.gachaClient.fetchPage({
              game: this.game,
              market,
              auth: auth(),
              pool,
              cursor,
              signal,
            }),
          normalize: item => adapter.normalize(item, { ...role, lang: auth().lang }),
          hasRecord: record => knownIds.has(record.id) || pendingIds.has(record.id),
          pageDelayMs: this.pageDelayMs,
          sleep: this.sleep,
          random: this.random,
        })

      try {
        let result
        try {
          result = await runPool()
        } catch (error) {
          if (error?.code !== "AUTHKEY_EXPIRED" || refreshed || parsed || !credential) throw error
          refreshed = true
          this.authKeyCache.delete(userId, role)
          authkey = await this.authKeyClient.generate(credential, role, { signal })
          this.authKeyCache.set(userId, role, authkey)
          result = await runPool()
        }
        for (const record of result.records) {
          if (knownIds.has(record.id) || pendingIds.has(record.id)) continue
          pendingIds.add(record.id)
          pending.push(record)
        }
        poolResults.push(
          Object.freeze({
            pool: pool.queryType,
            endpointKind: pool.endpointKind,
            added: result.records.length,
            pages: result.pages,
            stopReason: result.stopReason,
          }),
        )
      } catch (error) {
        errors.push(
          Object.freeze({
            pool: pool.queryType,
            endpointKind: pool.endpointKind,
            code: String(error?.code ?? "UNKNOWN_ERROR"),
            retcode: error?.retcode,
          }),
        )
        if (error?.code === "AUTHKEY_EXPIRED") break
      }
    }

    const merged = await this.recordStore.merge(role, pending)
    return Object.freeze({
      game: this.game,
      uid: role.uid,
      market,
      added: merged.added,
      total: merged.total,
      refreshedAuthkey: refreshed,
      pools: Object.freeze(poolResults),
      errors: Object.freeze(errors),
    })
  }
}
