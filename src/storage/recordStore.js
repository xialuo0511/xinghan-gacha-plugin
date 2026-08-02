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

function roleHash(role) {
  return createHash("sha256")
    .update(`${role.gameBiz}:${role.uid}`, "utf8")
    .digest("hex")
}

function sanitizeRecord(record, role) {
  if (String(record.gameBiz) !== String(role.gameBiz) || String(record.uid) !== String(role.uid)) {
    throw new RangeError("Record does not belong to the target role")
  }
  const clean = {}
  for (const field of RECORD_FIELDS) {
    if (record[field] !== undefined) clean[field] = String(record[field])
  }
  if (!clean.id) throw new TypeError("Record id is required")
  return clean
}

export class RecordStore {
  constructor({ directory, fileSystem = fs } = {}) {
    if (!directory) throw new TypeError("Record directory is required")
    this.directory = path.resolve(directory)
    this.fs = fileSystem
  }

  file(role) {
    return path.join(this.directory, `${roleHash(role)}.json`)
  }

  async load(role) {
    let source
    try {
      source = await this.fs.readFile(this.file(role), "utf8")
    } catch (error) {
      if (error?.code === "ENOENT") return []
      throw error
    }
    const data = JSON.parse(source)
    if (data?.version !== 1 || !Array.isArray(data.records)) {
      throw new Error("Unsupported record file")
    }
    return data.records.map(record => sanitizeRecord(record, role))
  }

  async merge(role, incoming) {
    const existing = await this.load(role)
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
    const data = {
      version: 1,
      gameBiz: String(role.gameBiz),
      uid: String(role.uid),
      updatedAt: new Date().toISOString(),
      records,
    }
    await this.fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const target = this.file(role)
    const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`
    await this.fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await this.fs.rename(temporary, target)
    return Object.freeze({ added: added.length, total: records.length })
  }
}
