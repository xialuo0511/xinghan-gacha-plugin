import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { compareRecordIds } from "../games/registry.js"

const RECORD_FIELDS = Object.freeze([
  "game",
  "gameBiz",
  "uid",
  "id",
  "gachaType",
  "gachaId",
  "itemId",
  "name",
  "itemType",
  "rankType",
  "count",
  "time",
  "lang",
])

function hash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex")
}

function userHash(userId) {
  return hash(`user:${String(userId)}`)
}

function roleHash(role) {
  return hash(`${role.gameBiz}:${role.uid}`)
}

function normalizeRole(role) {
  const normalized = {
    game: String(role?.game ?? ""),
    gameBiz: String(role?.gameBiz ?? ""),
    uid: String(role?.uid ?? ""),
    region: String(role?.region ?? ""),
    lang: String(role?.lang ?? "zh-cn"),
  }
  if (!normalized.game || !normalized.gameBiz || !normalized.uid || !normalized.region) {
    throw new TypeError("Record role requires game, gameBiz, uid, and region")
  }
  return normalized
}

function sanitizeRecord(record, roleInput) {
  const role = normalizeRole(roleInput)
  const recordGame = String(record.game ?? role.game)
  if (
    recordGame !== role.game ||
    String(record.gameBiz) !== role.gameBiz ||
    String(record.uid) !== role.uid
  ) {
    throw new RangeError("Record does not belong to the target role")
  }
  const clean = {}
  for (const field of RECORD_FIELDS) {
    if (record[field] !== undefined) clean[field] = String(record[field])
  }
  clean.game = role.game
  if (!clean.id || !/^\d+$/.test(clean.id)) throw new TypeError("Record id must contain digits")
  return clean
}

function roleMatches(left, right) {
  return ["game", "gameBiz", "uid", "region"].every(
    field => String(left?.[field] ?? "") === String(right?.[field] ?? ""),
  )
}

export class RecordStore {
  constructor({ directory, fileSystem = fs } = {}) {
    if (!directory) throw new TypeError("Record directory is required")
    this.directory = path.resolve(directory)
    this.fs = fileSystem
    this.queues = new Map()
  }

  userDirectory(userId) {
    return path.join(this.directory, userHash(userId))
  }

  file(userId, role) {
    return path.join(this.userDirectory(userId), `${roleHash(normalizeRole(role))}.json`)
  }

  legacyFile(role) {
    return path.join(this.directory, `${roleHash(normalizeRole(role))}.json`)
  }

  legacyClaimFile(role) {
    return `${this.legacyFile(role)}.claim.json`
  }

  async claimLegacy(userId, role) {
    const claim = { version: 1, owner: userHash(userId) }
    try {
      await this.fs.writeFile(this.legacyClaimFile(role), `${JSON.stringify(claim)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      })
      return true
    } catch (error) {
      if (error?.code !== "EEXIST") throw error
      const existing = await this.readJson(this.legacyClaimFile(role))
      return existing?.owner === claim.owner
    }
  }

  async readJson(file) {
    try {
      return JSON.parse(await this.fs.readFile(file, "utf8"))
    } catch (error) {
      if (error?.code === "ENOENT") return undefined
      throw error
    }
  }

  recordsFromDocument(data, role, { allowLegacy = false } = {}) {
    if (!data || !Array.isArray(data.records)) throw new Error("Unsupported record file")
    if (data.version === 2) {
      if (!roleMatches(data.role, role)) throw new Error("Record file role metadata does not match")
    } else if (!(allowLegacy && data.version === 1)) {
      throw new Error("Unsupported record file")
    }
    return data.records.map(record => sanitizeRecord(record, role))
  }

  async write(userId, roleInput, records) {
    const role = normalizeRole(roleInput)
    const directory = this.userDirectory(userId)
    await this.fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const target = this.file(userId, role)
    const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`
    const data = {
      version: 2,
      owner: userHash(userId),
      role,
      updatedAt: new Date().toISOString(),
      records,
    }
    await this.fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await this.fs.rename(temporary, target)
  }

  async load(userId, roleInput) {
    const role = normalizeRole(roleInput)
    const current = await this.readJson(this.file(userId, role))
    if (current) {
      if (current.owner !== userHash(userId)) throw new Error("Record file owner does not match")
      return this.recordsFromDocument(current, role)
    }

    const legacy = await this.readJson(this.legacyFile(role))
    if (!legacy) return []
    if (!(await this.claimLegacy(userId, role))) return []
    const records = this.recordsFromDocument(legacy, role, { allowLegacy: true })
    await this.write(userId, role, records)
    return records
  }

  async withRoleLock(userId, role, operation) {
    const key = `${userHash(userId)}:${roleHash(role)}`
    const previous = this.queues.get(key) ?? Promise.resolve()
    let release
    const gate = new Promise(resolve => {
      release = resolve
    })
    const tail = previous.then(() => gate)
    this.queues.set(key, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.queues.get(key) === tail) this.queues.delete(key)
    }
  }

  async merge(userId, roleInput, incoming) {
    const role = normalizeRole(roleInput)
    return this.withRoleLock(userId, role, () => this.mergeUnlocked(userId, role, incoming))
  }

  async mergeUnlocked(userId, role, incoming) {
    const existing = await this.load(userId, role)
    const known = new Set(existing.map(record => record.id))
    const added = []
    for (const value of incoming) {
      const record = sanitizeRecord(value, role)
      if (known.has(record.id)) continue
      known.add(record.id)
      added.push(record)
    }
    if (added.length === 0) return Object.freeze({ added: 0, total: existing.length })

    const records = [...existing, ...added].sort((left, right) => compareRecordIds(right.id, left.id))
    await this.write(userId, role, records)
    return Object.freeze({ added: added.length, total: records.length })
  }

  async listRoles(userId) {
    let entries
    try {
      entries = await this.fs.readdir(this.userDirectory(userId), { withFileTypes: true })
    } catch (error) {
      if (error?.code === "ENOENT") return []
      throw error
    }

    const roles = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      const data = await this.readJson(path.join(this.userDirectory(userId), entry.name))
      if (data?.version !== 2 || data.owner !== userHash(userId)) continue
      try {
        roles.push(normalizeRole(data.role))
      } catch {
        // Ignore unrelated or damaged files; loading the specific role will surface the error.
      }
    }
    return roles.sort((left, right) =>
      `${left.game}:${left.uid}`.localeCompare(`${right.game}:${right.uid}`),
    )
  }
}
