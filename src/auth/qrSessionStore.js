import { randomUUID } from "node:crypto"

function keyPart(userId) {
  return Buffer.from(String(userId), "utf8").toString("base64url")
}

export class RedisQrSessionStore {
  constructor(redis, { prefix = "hoyo-gacha:qr:", ttlSeconds = 300 } = {}) {
    if (!redis?.set || !redis?.get || !redis?.del) throw new TypeError("Redis client is required")
    this.redis = redis
    this.prefix = prefix
    this.ttlSeconds = ttlSeconds
  }

  key(userId) {
    return `${this.prefix}${keyPart(userId)}`
  }

  async acquire(userId, session) {
    const result = await this.redis.set(this.key(userId), JSON.stringify(session), {
      EX: this.ttlSeconds,
      NX: true,
    })
    return result === "OK" || result === true
  }

  async get(userId) {
    const value = await this.redis.get(this.key(userId))
    if (!value) return undefined
    try {
      return JSON.parse(value)
    } catch {
      await this.delete(userId)
      return undefined
    }
  }

  async update(userId, session) {
    const result = await this.redis.set(this.key(userId), JSON.stringify(session), {
      EX: this.ttlSeconds,
      XX: true,
    })
    return result === "OK" || result === true
  }

  async delete(userId) {
    await this.redis.del(this.key(userId))
  }
}

export class MemoryQrSessionStore {
  constructor() {
    this.sessions = new Map()
  }

  async acquire(userId, session) {
    const key = String(userId)
    if (this.sessions.has(key)) return false
    this.sessions.set(key, structuredClone(session))
    return true
  }

  async get(userId) {
    const value = this.sessions.get(String(userId))
    return value ? structuredClone(value) : undefined
  }

  async update(userId, session) {
    const key = String(userId)
    if (!this.sessions.has(key)) return false
    this.sessions.set(key, structuredClone(session))
    return true
  }

  async delete(userId) {
    this.sessions.delete(String(userId))
  }
}

export function newSessionId() {
  return randomUUID()
}
