import assert from "node:assert/strict"
import test from "node:test"

import { importContent, sendPrivateFile } from "../../src/adapters/yunzai/files.js"

test("extracts inline or buffered UIGF content without accepting display placeholders", () => {
  assert.equal(importContent({ msg: '#导入抽卡记录 {"info":{}}' }), '{"info":{}}')
  assert.deepEqual(
    importContent({ msg: "#导入抽卡记录 [文件]", file: { buffer: Buffer.from("fixture") } }),
    Buffer.from("fixture"),
  )
})

test("uses the private friend adapter to send an export", async () => {
  const calls = []
  const app = {
    e: { friend: { sendFile: async (...args) => calls.push(args) } },
  }
  await sendPrivateFile(app, "C:\\fixture\\export.json", "export.json")
  assert.deepEqual(calls, [["C:\\fixture\\export.json", "export.json"]])
})
