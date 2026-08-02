import { readdir, readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"

const ignored = new Set([".git", "coverage", "data", "node_modules", "temp"])

async function collect(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collect(fullPath)))
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath)
  }
  return files
}

let failed = false
const files = await collect(process.cwd())

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" })
  if (result.status !== 0) failed = true

  const source = await readFile(file, "utf8")
  source.split(/\r?\n/).forEach((line, index) => {
    if (/\s+$/.test(line)) {
      console.error(`${path.relative(process.cwd(), file)}:${index + 1}: trailing whitespace`)
      failed = true
    }
    if (line.includes("\t")) {
      console.error(`${path.relative(process.cwd(), file)}:${index + 1}: tab character`)
      failed = true
    }
  })
}

if (failed) process.exitCode = 1
else console.log(`Checked ${files.length} JavaScript files`)
