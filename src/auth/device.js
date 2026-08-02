import { randomBytes } from "node:crypto"

export function createDeviceProfile({ bytes = randomBytes } = {}) {
  const id = bytes(16).toString("hex").toUpperCase()
  const suffix = bytes(6).toString("hex")
  return Object.freeze({
    id,
    name: `Android-${suffix.slice(0, 8)}`,
    model: `M${suffix.slice(0, 10).toUpperCase()}`,
  })
}
