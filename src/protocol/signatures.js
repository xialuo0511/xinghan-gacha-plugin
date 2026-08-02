import { createHash, randomBytes, randomInt } from "node:crypto"

function md5(value) {
  return createHash("md5").update(value, "utf8").digest("hex")
}

function timestampSeconds(now) {
  const value = typeof now === "function" ? now() : now
  return Math.floor((value ?? Date.now()) / 1000)
}

export function createDs2({
  salt,
  body = "",
  query = "",
  now = Date.now,
  random = () => randomInt(100001, 200001),
}) {
  if (!salt) throw new TypeError("DS2 salt is required")
  const timestamp = timestampSeconds(now)
  const nonce = String(random())
  const digest = md5(`salt=${salt}&t=${timestamp}&r=${nonce}&b=${body}&q=${query}`)
  return `${timestamp},${nonce},${digest}`
}

export function createDs({
  salt,
  now = Date.now,
  random = () => randomBytes(6).toString("base64url").slice(0, 6),
}) {
  if (!salt) throw new TypeError("DS salt is required")
  const timestamp = timestampSeconds(now)
  const nonce = String(random())
  const digest = md5(`salt=${salt}&t=${timestamp}&r=${nonce}`)
  return `${timestamp},${nonce},${digest}`
}
