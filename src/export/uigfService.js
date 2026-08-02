import { getGameAdapter } from "../games/registry.js"
import { ProtocolError } from "../protocol/http.js"
import { buildUigf, parseUigf } from "./uigf.js"

function roleKey(role) {
  return `${role.game}:${role.gameBiz}:${role.region}:${role.uid}`
}

function mergeRoles(...groups) {
  const roles = new Map()
  for (const group of groups) {
    for (const role of group ?? []) roles.set(roleKey(role), role)
  }
  return roles
}

export class UigfService {
  constructor({ recordStore, credentialStore, appVersion = "0.1.0", now } = {}) {
    if (!recordStore || !credentialStore) throw new TypeError("UIGF stores are required")
    Object.assign(this, { recordStore, credentialStore, appVersion, now })
  }

  async roles(userId) {
    const credential = await this.credentialStore.load(userId)
    return mergeRoles(credential?.roles, await this.recordStore.listRoles(userId))
  }

  async export(userId) {
    const roles = await this.roles(userId)
    const accounts = []
    let recordCount = 0
    for (const role of roles.values()) {
      const records = await this.recordStore.load(userId, role)
      if (records.length === 0) continue
      accounts.push({ role, records })
      recordCount += records.length
    }
    if (accounts.length === 0) {
      throw new ProtocolError("NO_GACHA_RECORDS", "No gacha records are available")
    }
    const data = buildUigf({ accounts, appVersion: this.appVersion, now: this.now })
    return Object.freeze({
      data,
      json: `${JSON.stringify(data, null, 2)}\n`,
      filename: `xinghan-gacha-uigf-${data.info.export_timestamp}.json`,
      accounts: accounts.length,
      records: recordCount,
    })
  }

  async import(userId, input) {
    const groups = parseUigf(input)
    if (groups.length === 0) throw new ProtocolError("INVALID_UIGF", "Import has no accounts")
    const roles = await this.roles(userId)
    const resolved = new Map()
    for (const group of groups) {
      const matches = [...roles.values()].filter(
        role => role.game === group.game && role.uid === group.uid,
      )
      if (matches.length !== 1) {
        throw new ProtocolError(
          "IMPORT_ROLE_REQUIRED",
          `No matching role for ${group.game}:${group.uid}`,
        )
      }
      const [role] = matches
      const adapter = getGameAdapter(group.game)
      try {
        const key = roleKey(role)
        const current = resolved.get(key) ?? { role, records: [] }
        current.records.push(
          ...group.records.map(record =>
            adapter.normalize(record, { ...role, lang: record.lang ?? group.lang }),
          ),
        )
        resolved.set(key, current)
      } catch {
        throw new ProtocolError("INVALID_UIGF", `Invalid records for ${group.game}:${group.uid}`)
      }
    }

    let added = 0
    let total = 0
    for (const group of resolved.values()) {
      const merged = await this.recordStore.merge(userId, group.role, group.records)
      added += merged.added
      total += merged.total
    }
    return Object.freeze({ accounts: resolved.size, added, total })
  }
}
