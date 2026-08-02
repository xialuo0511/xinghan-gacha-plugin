import { ProtocolError } from "../../protocol/http.js"

export function importContent(event) {
  const message = String(event?.msg ?? "")
  const inline = message.replace(/^#?导入抽卡记录\s*/, "").trim()
  if (inline.startsWith("{") && inline !== message) return inline

  const candidates = [event?.file?.data, event?.file?.buffer, event?.file?.content]
  for (const segment of event?.message ?? []) {
    candidates.push(segment?.data?.data, segment?.data?.buffer, segment?.data?.content)
  }
  return candidates.find(value => typeof value === "string" || Buffer.isBuffer(value))
}

export async function sendPrivateFile(app, filePath, filename) {
  const friend = app.e?.friend
  if (typeof friend?.sendFile === "function") {
    await friend.sendFile(filePath, filename)
    return
  }
  if (typeof globalThis.segment?.file === "function") {
    await app.reply(globalThis.segment.file(filePath, filename))
    return
  }
  throw new ProtocolError("FILE_SEND_UNAVAILABLE", "Current adapter cannot send files")
}
