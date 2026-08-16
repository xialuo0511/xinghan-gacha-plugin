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

  const startupLogs = []
  globalThis.logger = {
    mark: message => startupLogs.push(message),
    info: message => startupLogs.push(message),
    warn: message => startupLogs.push(message),
  }
  context.after(() => delete globalThis.logger)
  const loaded = await import(`${pathToFileURL(path.join(pluginRoot, "index.js")).href}?smoke=1`)
  assert.equal(startupLogs.some(message => /2026-08-16-records-r8/.test(message)), true)
  assert.equal(startupLogs.some(message => /records/.test(message)), true)
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
  assert.equal(records.priority, 1000)
  for (const command of [
    "#抽卡记录-查看原神抽卡记录",
    "#查看原神抽卡记录",
    "#抽卡记录",
    "*抽卡记录-查看HSR的",
    "#查看星铁抽卡记录",
    "*抽卡记录",
    "%抽卡记录-查看ZZZ的",
    "％抽卡记录-查看绝区零的抽卡记录",
    "#查看绝区零抽卡记录",
    "%抽卡记录",
    "％抽卡记录",
    "%绝区零抽卡记录",
    "％绝区零抽卡记录",
    "#原神抽卡记录下一批",
    "#星铁抽卡记录下一批",
    "#绝区零抽卡记录下一批",
  ]) {
    assert.equal(records.rule.some(rule => new RegExp(rule.reg).test(command)), true)
  }

  const recordReplies = []
  records.e = {
    isPrivate: true,
    user_id: "fixture-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async message => recordReplies.push(message),
  }
  await records.viewZzz()
  assert.match(recordReplies[0], /正在生成绝区零抽卡记录图/)
  assert.equal(startupLogs.some(message => /records.*命令已命中.*game=zzz/.test(message)), true)

  const gate = await import(pathToFileURL(path.join(pluginRoot, "src", "adapters", "yunzai", "recordRenderGate.js")))
  let releaseBlocker
  let markBlockerStarted
  const blockerStarted = new Promise(resolve => {
    markBlockerStarted = resolve
  })
  const blocker = gate.enqueueRecordRender("fixture:blocker", async () => {
    markBlockerStarted()
    await new Promise(resolve => {
      releaseBlocker = resolve
    })
  })
  await blockerStarted

  const firstEventReplies = []
  const secondEventReplies = []
  const queuedRecords = new loaded.apps.records()
  queuedRecords.e = {
    isPrivate: true,
    user_id: "first-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async message => firstEventReplies.push(message),
  }
  const queuedView = queuedRecords.viewGenshin()
  await new Promise(resolve => setImmediate(resolve))
  queuedRecords.e = {
    isPrivate: true,
    user_id: "second-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async message => secondEventReplies.push(message),
  }
  releaseBlocker()
  await blocker.completion
  await queuedView
  assert.match(firstEventReplies[0], /已进入生成队列/)
  assert.equal(firstEventReplies.length >= 2, true)
  assert.deepEqual(secondEventReplies, [])

  const batchView = {
    game: "genshin",
    uid: "batch-uid",
    latestRecordAt: "2026-08-16T00:00:00.000Z",
    summary: { totalRecords: 1_930, highCount: 193 },
    pools: [{
      queryType: "301",
      name: "角色活动祈愿",
      total: 1_930,
      highCount: 193,
      items: Array.from({ length: 193 }, (_, index) => ({
        id: String(index + 1),
        name: `结果 ${index + 1}`,
      })),
    }],
  }
  const batchReplies = []
  const renderedPages = []
  const batchRecords = new loaded.apps.records()
  batchRecords.e = {
    isPrivate: true,
    user_id: "batch-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async message => {
      batchReplies.push(message)
      return { message_id: String(batchReplies.length) }
    },
  }
  batchRecords.getRecordRuntime = () => ({
    recordViewService: { get: async () => batchView },
  })
  batchRecords.renderRecordPage = async page => {
    renderedPages.push(page)
    return { type: "image", page: page.pagination.page }
  }
  batchRecords.waitRecordPageInterval = async () => {}

  await batchRecords.viewGenshin()
  assert.deepEqual(renderedPages.map(page => page.pagination.page), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(
    renderedPages.reduce(
      (sum, page) => sum + page.pools.reduce((poolSum, pool) => poolSum + pool.items.length, 0),
      0,
    ),
    192,
  )
  assert.equal(
    batchReplies.some(message => typeof message === "string" && /#原神抽卡记录下一批/.test(message)),
    true,
  )

  await batchRecords.nextGenshin()
  assert.deepEqual(renderedPages.map(page => page.pagination.page), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(renderedPages[8].pools[0].items.length, 1)

  let resolveLateView
  let timedOutRenderCount = 0
  const timedOutReplies = []
  const timedOutRecords = new loaded.apps.records()
  timedOutRecords.e = {
    isPrivate: true,
    user_id: "timed-out-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async message => timedOutReplies.push(message),
  }
  timedOutRecords.getRecordRuntime = () => ({
    recordViewService: {
      get: () => new Promise(resolve => {
        resolveLateView = resolve
      }),
    },
  })
  timedOutRecords.recordViewLoadTimeoutMilliseconds = () => 5
  timedOutRecords.renderRecordPage = async () => {
    timedOutRenderCount += 1
    return { type: "image" }
  }

  await timedOutRecords.viewGenshin()
  assert.equal(timedOutRenderCount, 0)
  assert.equal(
    timedOutReplies.some(message => typeof message === "string" && /读取抽卡记录超时/.test(message)),
    true,
  )

  const afterTimeoutPages = []
  const afterTimeoutRecords = new loaded.apps.records()
  afterTimeoutRecords.e = {
    isPrivate: true,
    user_id: "after-timeout-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async () => ({ message_id: "after-timeout" }),
  }
  afterTimeoutRecords.getRecordRuntime = () => ({
    recordViewService: { get: async () => ({ ...batchView, uid: "after-timeout-uid" }) },
  })
  afterTimeoutRecords.renderRecordPage = async page => {
    afterTimeoutPages.push(page.pagination.page)
    return { type: "image", page: page.pagination.page }
  }
  afterTimeoutRecords.waitRecordPageInterval = async () => {}

  await afterTimeoutRecords.viewGenshin()
  assert.deepEqual(afterTimeoutPages, [1, 2, 3, 4, 5, 6, 7, 8])

  resolveLateView(batchView)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timedOutRenderCount, 0)

  const failedPages = []
  const failedReplies = []
  let rejectFirstPage = true
  const failedRecords = new loaded.apps.records()
  failedRecords.e = {
    isPrivate: true,
    user_id: "failed-user",
    self_id: "fixture-bot",
    adapter_name: "MCQQ",
    reply: async message => {
      failedReplies.push(message)
      if (rejectFirstPage && message?.type === "image") return { error: "rate limited" }
      return { message_id: String(failedReplies.length) }
    },
  }
  failedRecords.getRecordRuntime = () => ({
    recordViewService: {
      get: async () => ({
        ...batchView,
        uid: "failed-uid",
        summary: { totalRecords: 250, highCount: 25 },
        pools: [{ ...batchView.pools[0], total: 250, highCount: 25, items: batchView.pools[0].items.slice(0, 25) }],
      }),
    },
  })
  failedRecords.renderRecordPage = async page => {
    failedPages.push(page.pagination.page)
    return { type: "image", page: page.pagination.page }
  }
  failedRecords.waitRecordPageInterval = async () => {}

  await failedRecords.viewGenshin()
  assert.deepEqual(failedPages, [1])
  assert.equal(
    failedReplies.some(message => typeof message === "string" && /下一批 重试/.test(message)),
    true,
  )

  rejectFirstPage = false
  await failedRecords.nextGenshin()
  assert.deepEqual(failedPages, [1, 1, 2])

  const status = new loaded.apps.status()
  assert.equal(status.rule.some(rule => new RegExp(rule.reg).test("#星瀚抽卡诊断")), true)
  const statusReplies = []
  status.e = { isPrivate: true, adapter_name: "MCQQ", message_type: "private" }
  status.reply = async message => statusReplies.push(message)
  await status.diagnose()
  assert.match(statusReplies[0], /2026-08-16-records-r8/)
  assert.match(statusReplies[0], /主密钥：当前进程(?:已|未)读取/)

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
