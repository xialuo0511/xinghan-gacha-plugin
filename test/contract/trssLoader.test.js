import assert from "node:assert/strict"
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"

test("TRSS-style root loader imports every app class", async context => {
  const project = path.resolve(fileURLToPath(new URL("../..", import.meta.url)))
  const root = await mkdtemp(path.join(os.tmpdir(), "hoyo-trss-loader-"))
  context.after(() => rm(root, { recursive: true, force: true }))
  const pluginRoot = path.join(root, "plugins", "hoyo-gacha-plugin")
  await mkdir(pluginRoot, { recursive: true })
  for (const entry of ["apps", "src", "index.js", "package.json"]) {
    await cp(path.join(project, entry), path.join(pluginRoot, entry), { recursive: true })
  }
  await symlink(path.join(project, "node_modules"), path.join(pluginRoot, "node_modules"), "junction")
  const pluginBase = path.join(root, "lib", "plugins")
  await mkdir(pluginBase, { recursive: true })
  await writeFile(
    path.join(pluginBase, "plugin.js"),
    "export default class plugin { constructor(options) { Object.assign(this, options) } reply() {} }\n",
    "utf8",
  )

  const loaded = await import(`${pathToFileURL(path.join(pluginRoot, "index.js")).href}?smoke=1`)
  assert.deepEqual(Object.keys(loaded.apps), ["account", "gacha", "login", "status"])
  for (const App of Object.values(loaded.apps)) {
    const instance = new App()
    assert.ok(Array.isArray(instance.rule))
  }
})
