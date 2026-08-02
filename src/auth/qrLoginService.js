import { ProtocolError } from "../protocol/http.js"
import { newSessionId } from "./qrSessionStore.js"

const TERMINAL_STATES = new Set(["Confirmed", "Expired", "Cancelled"])

function defaultSelection(roles) {
  const selectedRoles = {}
  for (const role of roles) selectedRoles[role.game] ??= role.uid
  return selectedRoles
}

export class QrLoginService {
  constructor({
    client,
    sessionStore,
    credentialExchange,
    roleDiscovery,
    credentialStore,
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    pollIntervalMs = 5_000,
    maxAttempts = 59,
    now = Date.now,
  }) {
    Object.assign(this, {
      client,
      sessionStore,
      credentialExchange,
      roleDiscovery,
      credentialStore,
      sleep,
      pollIntervalMs,
      maxAttempts,
      now,
    })
  }

  async start(userId, { signal } = {}) {
    const device = this.client.createDevice()
    const session = {
      id: newSessionId(),
      state: "Creating",
      device,
      createdAt: this.now(),
    }
    if (!(await this.sessionStore.acquire(userId, session))) {
      throw new ProtocolError("QR_SESSION_EXISTS", "A QR login session is already active")
    }

    try {
      const created = await this.client.create({ device, signal })
      const ready = { ...session, state: "Created", ticket: created.ticket }
      if (!(await this.sessionStore.update(userId, ready))) {
        throw new ProtocolError("QR_SESSION_LOST", "QR login session expired before it was ready")
      }
      return Object.freeze({ url: created.url, state: "Created" })
    } catch (error) {
      await this.sessionStore.delete(userId)
      throw error
    }
  }

  async poll(userId, { signal, onStatus = async () => {} } = {}) {
    let lastState = "Created"
    try {
      for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
        if (signal?.aborted) throw new ProtocolError("QR_CANCELLED", "QR login was cancelled")
        if (this.pollIntervalMs > 0) await this.sleep(this.pollIntervalMs)
        const session = await this.sessionStore.get(userId)
        if (!session) throw new ProtocolError("QR_SESSION_LOST", "QR login session is no longer active")

        const result = await this.client.query({
          device: session.device,
          ticket: session.ticket,
          signal,
        })
        if (result.state !== lastState) {
          lastState = result.state
          await this.sessionStore.update(userId, { ...session, state: result.state })
          await onStatus(Object.freeze({ state: result.state }))
        }

        if (result.state === "Confirmed") {
          const credential = this.client.extractCredential(result.data, session.device)
          const cookieToken = await this.credentialExchange.getCookieToken(credential, { signal })
          const discovery = await this.roleDiscovery.discover(credential, cookieToken, { signal })
          const storedCredential = {
            ...credential,
            roles: discovery.roles,
            selectedRoles: defaultSelection(discovery.roles),
          }
          const saved = await this.credentialStore.save(userId, storedCredential)
          return Object.freeze({
            state: "Confirmed",
            roles: discovery.roles,
            discoveryErrors: discovery.errors,
            persistence: saved.persistence,
          })
        }

        if (TERMINAL_STATES.has(result.state)) {
          return Object.freeze({ state: result.state })
        }
      }
      return Object.freeze({ state: "Expired" })
    } finally {
      await this.sessionStore.delete(userId)
    }
  }

  async cancel(userId) {
    const existing = await this.sessionStore.get(userId)
    await this.sessionStore.delete(userId)
    return Boolean(existing)
  }
}
