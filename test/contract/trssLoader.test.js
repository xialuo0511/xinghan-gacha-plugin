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
  const pluginRoot = path.join(root, "plugins", "xinghan-gacha-plugin")
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
  const puppeteerBase = path.join(root, "lib", "puppeteer")
  await mkdir(puppeteerBase, { recursive: true })
  await writeFile(
    path.join(puppeteerBase, "puppeteer.js"),
    "export default { screenshot: async () => ({ type: 'image' }) }\n",
    "utf8",
  )

  const loaded = await import(`${pathToFileURL(path.join(pluginRoot, "index.js")).href}?smoke=1`)
  assert.deepEqual(Object.keys(loaded.apps), [
    "account",
    "gacha",
    "help",
    "login",
    "records",
    "status",
    "update",
  ])
  for (const App of Object.values(loaded.apps)) {
    const instance = new App()
    assert.ok(Array.isArray(instance.rule))
    for (const rule of instance.rule) assert.equal(typeof instance[rule.fnc], "function")
  }

  const gacha = new loaded.apps.gacha()
  const commands = [
    "#更新原神抽卡记录",
    "#更新星铁抽卡记录",
    "#更新绝区零抽卡记录",
    "#更新全部抽卡记录",
    "#导出抽卡记录",
    "#导入抽卡记录 {\"info\":{}}",
    "#导入原神抽卡URL 123456789 https://example.test",
    "#导入星铁抽卡URL 100000001 https://example.test",
    "#导入绝区零抽卡URL 10000002 https://example.test",
  ]
  for (const command of commands) {
    assert.equal(gacha.rule.some(rule => new RegExp(rule.reg).test(command)), true)
  }

  const help = new loaded.apps.help()
  assert.equal(help.rule.some(rule => new RegExp(rule.reg).test("#星瀚抽卡帮助")), true)

  const records = new loaded.apps.records()
  for (const command of [
    "#抽卡记录-查看原神抽卡记录",
    "#查看原神抽卡记录",
    "*抽卡记录-查看HSR的",
    "#查看星铁抽卡记录",
    "%抽卡记录-查看ZZZ的",
    "％抽卡记录-查看绝区零的抽卡记录",
    "#查看绝区零抽卡记录",
  ]) {
    assert.equal(records.rule.some(rule => new RegExp(rule.reg).test(command)), true)
  }

  const update = new loaded.apps.update()
  for (const command of ["#星瀚抽卡更新", "#星瀚抽卡更新日志"]) {
    const rule = update.rule.find(value => new RegExp(value.reg).test(command))
    assert.equal(rule?.permission, "master")
  }
  const replies = []
  update.e = { isMaster: false }
  update.reply = async message => replies.push(message)
  await update.update()
  assert.match(replies[0], /只有机器人主人/)
})
