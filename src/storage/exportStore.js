import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

function userHash(userId) {
  return createHash("sha256").update(`user:${String(userId)}`, "utf8").digest("hex")
}

export class ExportStore {
  constructor({ directory, fileSystem = fs } = {}) {
    if (!directory) throw new TypeError("Export directory is required")
    this.directory = path.resolve(directory)
    this.fs = fileSystem
  }

  async write(userId, filename, content) {
    const safeName = path.basename(filename)
    if (!/^xinghan-gacha-uigf-\d+\.json$/.test(safeName)) {
      throw new TypeError("Invalid export filename")
    }
    const directory = path.join(this.directory, userHash(userId))
    await this.fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const target = path.join(directory, safeName)
    const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`
    await this.fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 })
    await this.fs.rename(temporary, target)
    return target
  }
}
