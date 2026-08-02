import assert from "node:assert/strict"
import test from "node:test"

import { REDACTED, redact, redactString } from "../../src/protocol/redaction.js"

test("redacts secrets in URLs and embedded log strings", () => {
  const secret = "auth-secret-123"
  const input = `request https://example.test/path?foo=1&authkey=${secret}&lang=zh-cn failed`
  const output = redactString(input)

  assert.equal(output.includes(secret), false)
  assert.match(output, /authkey=\[REDACTED\]/)
})

test("redacts Cookie and authorization headers", () => {
  const output = redactString(
    "Cookie: stuid=123; stoken_v2=token-secret; mid=mid-secret\nAuthorization: Bearer bearer-secret",
  )

  assert.equal(output.includes("token-secret"), false)
  assert.equal(output.includes("mid-secret"), false)
  assert.equal(output.includes("bearer-secret"), false)
})

test("redacts nested token fields without mutating input", () => {
  const input = {
    retcode: 0,
    data: {
      tokens: [{ token: "one" }],
      ticket: "two",
      safe: "visible",
    },
  }
  const output = redact(input)

  assert.equal(output.data.tokens, REDACTED)
  assert.equal(output.data.ticket, REDACTED)
  assert.equal(output.data.safe, "visible")
  assert.equal(input.data.ticket, "two")
})

test("redacts secrets from Error snapshots", () => {
  const secret = "never-log-this"
  const output = redact(new Error(`request failed: authkey=${secret}`))
  assert.equal(JSON.stringify(output).includes(secret), false)
})
