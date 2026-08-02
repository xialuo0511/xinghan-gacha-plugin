export class MemoryAuthKeyCache {
  constructor({ ttlMs = 24 * 60 * 60 * 1000, now = Date.now } = {}) {
    this.ttlMs = Math.min(ttlMs, 24 * 60 * 60 * 1000)
    this.now = now
    this.values = new Map()
  }

  key(userId, role) {
    return `${String(userId)}:${role.gameBiz}:${role.uid}`
  }

  get(userId, role) {
    const key = this.key(userId, role)
    const cached = this.values.get(key)
    if (!cached || cached.expiresAt <= this.now()) {
      this.values.delete(key)
      return undefined
    }
    return cached.authkey
  }

  set(userId, role, authkey) {
    this.values.set(this.key(userId, role), {
      authkey: String(authkey),
      expiresAt: this.now() + this.ttlMs,
    })
  }

  delete(userId, role) {
    this.values.delete(this.key(userId, role))
  }

  deleteUser(userId) {
    const prefix = `${String(userId)}:`
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) this.values.delete(key)
    }
  }
}
