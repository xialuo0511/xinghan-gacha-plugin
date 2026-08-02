import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { ProtocolError } from "../protocol/http.js"

const execFileAsync = promisify(execFile)
const TRUSTED_ORIGINS = new Set([
  "https://github.com/xialuo0511/xinghan-gacha-plugin",
  "https://github.com/xialuo0511/xinghan-gacha-plugin.git",
])

function updateError(code, message) {
  return new ProtocolError(code, message)
}

async function defaultRunner(args, { directory, timeoutMs = 120_000 } = {}) {
  try {
    return await execFileAsync("git", args, {
      cwd: directory,
      encoding: "utf8",
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
  } catch {
    throw updateError("UPDATE_FAILED", "Git update command failed")
  }
}

function stdout(result) {
  return String(result?.stdout ?? "").trim()
}

function trustedOrigin(value) {
  return TRUSTED_ORIGINS.has(String(value).trim().replace(/\/$/, ""))
}

function validBranch(value) {
  const branch = String(value).trim()
  if (
    !branch ||
    branch.length > 200 ||
    !/^[A-Za-z0-9._/-]+$/.test(branch) ||
    branch.startsWith("-") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.includes("..") ||
    branch.includes("//")
  ) {
    throw updateError("UPDATE_DETACHED", "Current Git branch is not updateable")
  }
  return branch
}

function commitId(value) {
  const id = String(value).trim()
  if (!/^[0-9a-f]{40}$/i.test(id)) throw updateError("UPDATE_FAILED", "Invalid Git commit id")
  return id.toLowerCase()
}

function safeText(value, maxLength = 160) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function parseLogs(value) {
  return String(value)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const [id = "", date = "", ...subject] = line.split("\t")
      return Object.freeze({
        id: safeText(id, 12),
        date: safeText(date, 10),
        subject: safeText(subject.join(" ")),
      })
    })
    .filter(log => log.id && log.subject)
}

export class GitUpdateService {
  constructor({ directory, runner = defaultRunner, maxLogEntries = 10 } = {}) {
    if (!directory) throw new TypeError("Plugin directory is required")
    if (typeof runner !== "function") throw new TypeError("Git runner must be a function")
    this.directory = directory
    this.runner = runner
    this.maxLogEntries = Math.max(1, Math.min(Number(maxLogEntries) || 10, 20))
    this.active = false
  }

  run(args) {
    return this.runner(args, { directory: this.directory })
  }

  async log(args) {
    const result = await this.run([
      "log",
      "--no-merges",
      "--format=%h%x09%cs%x09%s",
      ...args,
    ])
    return parseLogs(stdout(result))
  }

  async recent(limit = 20) {
    const count = Math.max(1, Math.min(Number(limit) || 20, 20))
    try {
      return Object.freeze({ logs: Object.freeze(await this.log([`--max-count=${count}`])) })
    } catch (error) {
      if (error?.code) throw error
      throw updateError("UPDATE_FAILED", "Unable to read Git history")
    }
  }

  async update() {
    if (this.active) throw updateError("UPDATE_IN_PROGRESS", "An update is already running")
    this.active = true
    try {
      return await this.performUpdate()
    } catch (error) {
      if (error?.code) throw error
      throw updateError("UPDATE_FAILED", "Unable to update plugin")
    } finally {
      this.active = false
    }
  }

  async performUpdate() {
    const origin = stdout(await this.run(["remote", "get-url", "origin"]))
    if (!trustedOrigin(origin)) {
      throw updateError("UPDATE_UNTRUSTED_REMOTE", "Git origin does not match the project repository")
    }

    const changes = stdout(await this.run(["status", "--porcelain=v1"]))
    if (changes) throw updateError("UPDATE_DIRTY", "Plugin working tree has local changes")

    const branch = validBranch(stdout(await this.run(["symbolic-ref", "--short", "HEAD"])))
    const before = commitId(stdout(await this.run(["rev-parse", "HEAD"])))
    const hooksPath = process.platform === "win32" ? "NUL" : "/dev/null"
    await this.run([
      "-c",
      `core.hooksPath=${hooksPath}`,
      "pull",
      "--ff-only",
      "--no-rebase",
      "origin",
      branch,
    ])
    const after = commitId(stdout(await this.run(["rev-parse", "HEAD"])))

    if (before === after) {
      const logs = await this.log([`--max-count=${Math.min(this.maxLogEntries, 5)}`])
      return Object.freeze({
        updated: false,
        branch,
        before,
        after,
        totalCommits: 0,
        logs: Object.freeze(logs),
        dependencyChanged: false,
      })
    }

    const range = `${before}..${after}`
    const totalCommits = Number(stdout(await this.run(["rev-list", "--count", range])))
    if (!Number.isSafeInteger(totalCommits) || totalCommits < 1) {
      throw updateError("UPDATE_FAILED", "Unable to count updated commits")
    }
    const logs = await this.log([`--max-count=${this.maxLogEntries}`, range])
    const dependencyFiles = stdout(
      await this.run(["diff", "--name-only", before, after, "--", "package.json", "pnpm-lock.yaml"]),
    )

    return Object.freeze({
      updated: true,
      branch,
      before,
      after,
      totalCommits,
      logs: Object.freeze(logs),
      dependencyChanged: Boolean(dependencyFiles),
    })
  }
}
