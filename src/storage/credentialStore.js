import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import { decryptJson, encryptJson, parseMasterKey } from "./encryption.js"

function userHash(userId) {
  return createHash("sha256").update(String(userId), "utf8").digest("hex")
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

export class CredentialStore {
  constructor({ directory, masterKey = process.env.HOYO_GACHA_MASTER_KEY, fileSystem = fs } = {}) {
    this.directory = directory ? path.resolve(directory) : undefined
    this.masterKey = parseMasterKey(masterKey)
    this.fs = fileSystem
    this.memory = new Map()
  }

  get persistent() {
    return Boolean(this.directory && this.masterKey)
  }

  file(userId) {
    if (!this.directory) throw new Error("Credential directory is not configured")
    return path.join(this.directory, `${userHash(userId)}.json`)
  }

  aad(userId) {
    return `hoyo-gacha-plugin:credential:v1:${String(userId)}`
  }

  async save(userId, credential) {
    const key = String(userId)
    this.memory.set(key, clone(credential))
    if (!this.persistent) return Object.freeze({ persistence: "memory" })

    await this.fs.mkdir(this.directory, { recursive: true, mode: 0o700 })
    const envelope = {
      ...encryptJson(credential, this.masterKey, this.aad(userId)),
      updatedAt: new Date().toISOString(),
    }
    const target = this.file(userId)
    const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`
    await this.fs.writeFile(temporary, `${JSON.stringify(envelope)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await this.fs.rename(temporary, target)
    return Object.freeze({ persistence: "encrypted-file" })
  }

  async load(userId) {
    const key = String(userId)
    if (this.memory.has(key)) return clone(this.memory.get(key))
    if (!this.persistent) return undefined
    let source
    try {
      source = await this.fs.readFile(this.file(userId), "utf8")
    } catch (error) {
      if (error?.code === "ENOENT") return undefined
      throw error
    }
    const credential = decryptJson(JSON.parse(source), this.masterKey, this.aad(userId))
    this.memory.set(key, credential)
    return clone(credential)
  }

  async delete(userId) {
    this.memory.delete(String(userId))
    if (!this.persistent) return
    await this.fs.rm(this.file(userId), { force: true })
  }
}
