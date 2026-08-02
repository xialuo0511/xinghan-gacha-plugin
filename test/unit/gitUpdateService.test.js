import assert from "node:assert/strict"
import test from "node:test"

import { GitUpdateService } from "../../src/update/gitUpdateService.js"

const BEFORE = "1".repeat(40)
const AFTER = "2".repeat(40)
const ORIGIN = "https://github.com/xialuo0511/xinghan-gacha-plugin.git"

function queueRunner(outputs) {
  const calls = []
  const runner = async args => {
    calls.push(args)
    if (outputs.length === 0) throw new Error("Unexpected Git command")
    const output = outputs.shift()
    if (output instanceof Error) throw output
    return { stdout: output, stderr: "" }
  }
  return { calls, runner, remaining: () => outputs.length }
}

test("pulls only a trusted fast-forward branch and returns sanitized update logs", async () => {
  const fixture = queueRunner([
    ORIGIN,
    "",
    "main",
    BEFORE,
    "Updating fixture",
    AFTER,
    "2",
    "2222222\t2026-08-02\tAdd feature\n1111111\t2026-08-01\tFix\u0007 log",
    "package.json",
  ])
  const service = new GitUpdateService({ directory: "C:\\fixture", runner: fixture.runner })
  const result = await service.update()

  assert.equal(result.updated, true)
  assert.equal(result.totalCommits, 2)
  assert.equal(result.dependencyChanged, true)
  assert.equal(result.logs[1].subject, "Fix log")
  const pull = fixture.calls.find(args => args.includes("pull"))
  assert.deepEqual(pull.slice(-5), [
    "pull",
    "--ff-only",
    "--no-rebase",
    "origin",
    "main",
  ])
  assert.equal(pull.some(value => String(value).startsWith("core.hooksPath=")), true)
  assert.equal(fixture.remaining(), 0)
})

test("reports the current commit and recent logs when already up to date", async () => {
  const fixture = queueRunner([
    ORIGIN,
    "",
    "main",
    BEFORE,
    "Already up to date.",
    BEFORE,
    "1111111\t2026-08-02\tCurrent release",
  ])
  const service = new GitUpdateService({ directory: "C:\\fixture", runner: fixture.runner })
  const result = await service.update()

  assert.equal(result.updated, false)
  assert.equal(result.after, BEFORE)
  assert.equal(result.logs[0].subject, "Current release")
  assert.equal(fixture.remaining(), 0)
})

test("rejects untrusted remotes and dirty working trees before pulling", async () => {
  const untrusted = queueRunner(["https://example.test/owner/repository.git"])
  await assert.rejects(
    new GitUpdateService({ directory: "C:\\fixture", runner: untrusted.runner }).update(),
    { code: "UPDATE_UNTRUSTED_REMOTE" },
  )
  assert.equal(untrusted.calls.some(args => args.includes("pull")), false)

  const dirty = queueRunner([ORIGIN, "?? local-file.js"])
  await assert.rejects(
    new GitUpdateService({ directory: "C:\\fixture", runner: dirty.runner }).update(),
    { code: "UPDATE_DIRTY" },
  )
  assert.equal(dirty.calls.some(args => args.includes("pull")), false)
})

test("does not expose Git output when an update command fails", async () => {
  const fixture = queueRunner([
    ORIGIN,
    "",
    "main",
    BEFORE,
    new Error("https://user:secret@github.com/private?token=secret"),
  ])
  const service = new GitUpdateService({ directory: "C:\\fixture", runner: fixture.runner })
  await assert.rejects(service.update(), error => {
    assert.equal(error.code, "UPDATE_FAILED")
    assert.equal(error.message.includes("secret"), false)
    return true
  })
})

test("rejects overlapping update attempts", async () => {
  const outputs = [ORIGIN, "", "main", BEFORE]
  let releasePull
  let markPullStarted
  const pullStarted = new Promise(resolve => {
    markPullStarted = resolve
  })
  const pullGate = new Promise(resolve => {
    releasePull = resolve
  })
  const runner = async args => {
    if (args.includes("pull")) {
      markPullStarted()
      await pullGate
      return { stdout: "Already up to date.", stderr: "" }
    }
    if (args.includes("log")) {
      return { stdout: "1111111\t2026-08-02\tCurrent release", stderr: "" }
    }
    return { stdout: outputs.shift() ?? BEFORE, stderr: "" }
  }
  const service = new GitUpdateService({ directory: "C:\\fixture", runner })
  const first = service.update()
  await pullStarted
  await assert.rejects(service.update(), { code: "UPDATE_IN_PROGRESS" })
  releasePull()
  await first
})

test("formats at most twenty recent commits", async () => {
  const lines = Array.from(
    { length: 20 },
    (_, index) => `${String(index).padStart(7, "0")}\t2026-08-02\tCommit ${index}`,
  ).join("\n")
  const fixture = queueRunner([lines])
  const service = new GitUpdateService({ directory: "C:\\fixture", runner: fixture.runner })
  const result = await service.recent(100)
  assert.equal(result.logs.length, 20)
  assert.equal(fixture.calls[0].includes("--max-count=20"), true)
})
