import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function decodeKey(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value)
  const text = String(value ?? "").trim()
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex")
  return Buffer.from(text, "base64url")
}

export function parseMasterKey(value) {
  if (!value) return undefined
  const key = decodeKey(value)
  if (key.length !== 32) throw new TypeError("HOYO_GACHA_MASTER_KEY must decode to exactly 32 bytes")
  return key
}

export function encryptJson(value, key, aad) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(aad, "utf8"))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ])
  return Object.freeze({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  })
}

export function decryptJson(envelope, key, aad) {
  if (envelope?.version !== 1 || envelope?.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported credential envelope")
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.iv, "base64url"),
    )
    decipher.setAAD(Buffer.from(aad, "utf8"))
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ])
    return JSON.parse(plaintext.toString("utf8"))
  } catch {
    throw new Error("Credential decryption failed")
  }
}
