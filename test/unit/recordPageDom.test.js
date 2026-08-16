import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"

class FakeElement {
  constructor(tag) {
    this.tag = tag
    this.children = []
    this.className = ""
    this.dataset = {}
    this.style = {}
    this.textContent = ""
  }

  append(...children) {
    this.children.push(...children)
  }

  remove() {
    this.removed = true
  }
}

function countClass(node, className) {
  const current = String(node.className).split(/\s+/).includes(className) ? 1 : 0
  return current + node.children.reduce((sum, child) => sum + countClass(child, className), 0)
}

function findClass(node, className) {
  if (String(node.className).split(/\s+/).includes(className)) return node
  for (const child of node.children) {
    const match = findClass(child, className)
    if (match) return match
  }
  return undefined
}

function textForClass(node, className) {
  return findClass(node, className)?.textContent
}

async function render(view) {
  const source = await readFile(new URL("../../resources/records/base.js", import.meta.url), "utf8")
  const body = new FakeElement("body")
  const container = new FakeElement("main")
  const data = new FakeElement("script")
  data.textContent = JSON.stringify(view)
  const document = {
    body,
    createElement: tag => new FakeElement(tag),
    getElementById: id => (id === "container" ? container : id === "record-data" ? data : undefined),
  }

  vm.runInNewContext(source, { document, JSON, Math, Number, String, Set })
  return { body, container }
}

function fixture() {
  const status = { label: "UP", tone: "up", source: "record" }
  return {
    game: "genshin",
    theme: { eyebrow: "提瓦特", title: "原神祈愿记录", subtitle: "测试副标题" },
    uid: "123456789",
    region: "天空岛",
    generatedAt: "2026-08-02T12:00:00.000Z",
    latestRecordAt: "2026-08-02 11:00:00",
    summary: {
      total: 1,
      highCount: 1,
      averageHighPity: 20,
      upCount: 1,
      offCount: 0,
      unknownUpCount: 0,
    },
    luck: { label: "欧皇", tone: "lucky" },
    assets: { fallbackUrl: "file:///fixture/item-fallback.webp" },
    pools: [
      {
        queryType: "301",
        name: "角色活动祈愿",
        total: 1,
        highCount: 1,
        currentPity: 0,
        pityCap: 90,
        pityPercent: 0,
        averageHighPity: 20,
        bestHighPity: 20,
        worstHighPity: 20,
        upCount: 1,
        offCount: 0,
        dateRange: { from: "2026-08-02 11:00:00", to: "2026-08-02 11:00:00" },
        items: [
          {
            name: "</script><script>alert(1)</script>",
            itemKind: "character",
            pulls: 20,
            pullLuck: { label: "欧皇", tone: "lucky" },
            time: "2026-08-02 11:00:00",
            status,
            asset: {
              url: "file:///fixture/miao/character.webp",
              source: "miao-plugin",
              kind: "character",
            },
          },
        ],
      },
      {
        queryType: "302",
        name: "武器活动祈愿",
        total: 1,
        highCount: 1,
        currentPity: 3,
        pityCap: 80,
        pityPercent: 4,
        averageHighPity: 35,
        bestHighPity: 35,
        worstHighPity: 35,
        upCount: 0,
        offCount: 0,
        dateRange: { from: "2026-08-01 11:00:00", to: "2026-08-02 11:00:00" },
        items: [
          {
            name: "护摩之杖",
            itemKind: "weapon",
            pulls: 35,
            pullLuck: { label: "小欧", tone: "good" },
            time: "2026-08-02 10:00:00",
          },
        ],
      },
      {
        queryType: "200",
        name: "常驻祈愿",
        total: 7,
        highCount: 0,
        currentPity: 7,
        pityCap: 90,
        pityPercent: 8,
        averageHighPity: undefined,
        bestHighPity: undefined,
        worstHighPity: undefined,
        upCount: 0,
        offCount: 0,
        dateRange: { from: "2026-08-01 11:00:00", to: "2026-08-02 11:00:00" },
        items: [],
      },
    ],
    disclaimer: "测试说明",
  }
}

test("shared record page script builds a complete DOM without HTML injection", async () => {
  const { body, container } = await render(fixture())

  assert.equal(body.dataset.rendered, "true")
  assert.equal(container.children.length, 3)
  assert.equal(countClass(container, "pool-column"), 2)
  assert.equal(countClass(container, "pool-panel"), 3)
  assert.equal(countClass(container, "result-card"), 2)
  assert.equal(countClass(container, "result-image"), 2)
  assert.equal(countClass(container, "result-kind-character"), 1)
  assert.equal(countClass(container, "result-kind-weapon"), 1)
  assert.equal(countClass(container, "status-up"), 1)
  assert.equal(countClass(container, "record-row"), 0)
  assert.equal(countClass(container, "highlight-card"), 0)
  assert.equal(countClass(container, "pull-number"), 2)
  assert.equal(countClass(container, "pull-lucky"), 1)
  assert.equal(countClass(container, "pull-good"), 1)
  assert.equal(countClass(container, "pool-empty"), 1)
  const serialized = JSON.stringify(container)
  assert.equal(serialized.includes("alert(1)"), true)
  assert.equal(serialized.includes("innerHTML"), false)
  assert.equal(serialized.includes("总体评价"), true)
  assert.equal(serialized.includes("1 个五星结果，平均 20 抽"), true)
  assert.equal(serialized.includes("卡池明细"), true)
  assert.equal(serialized.includes("欧非雷达"), false)
  assert.equal(serialized.includes("分池战报"), false)

  const firstImage = findClass(container, "result-image")
  assert.equal(firstImage.dataset.fallbackTried, "false")
  firstImage.onerror()
  assert.equal(firstImage.src, "file:///fixture/item-fallback.webp")
  assert.equal(firstImage.dataset.fallbackTried, "true")
  firstImage.onerror()
  assert.equal(firstImage.removed, true)
})

test("asset attribution distinguishes local, partial, fallback, and empty states", async () => {
  const partial = await render(fixture())
  assert.equal(
    textForClass(partial.container, "asset-credit"),
    "部分高稀有图片读取自本机 miao-plugin；其余使用本插件内置图像",
  )

  const allLocalView = fixture()
  allLocalView.assets.catalog = {
    zzz: {
      url: "file:///fixture/zzz/weapon.webp",
      source: "ZZZ-Plugin",
      kind: "weapon",
    },
  }
  allLocalView.pools[1].items[0].asset = {
    key: "zzz",
    source: "ZZZ-Plugin",
    kind: "weapon",
  }
  const allLocal = await render(allLocalView)
  assert.equal(
    textForClass(allLocal.container, "asset-credit"),
    "高稀有图片均读取自本机 miao-plugin 与 ZZZ-Plugin",
  )
  assert.equal(countClass(allLocal.container, "result-image"), 2)
  const weaponImage = findClass(findClass(allLocal.container, "result-kind-weapon"), "result-image")
  assert.equal(weaponImage.src, "file:///fixture/zzz/weapon.webp")

  const fallbackView = fixture()
  fallbackView.pools[0].items[0].asset = {
    url: fallbackView.assets.fallbackUrl,
    source: "builtin",
    kind: "character",
  }
  const fallback = await render(fallbackView)
  assert.equal(textForClass(fallback.container, "asset-credit"), "高稀有图片均使用本插件内置图像")

  const emptyView = fixture()
  for (const pool of emptyView.pools) {
    pool.items = []
    pool.highCount = 0
  }
  const empty = await render(emptyView)
  assert.equal(
    textForClass(empty.container, "asset-credit"),
    "当前无高稀有图片可展示；缺失图片将使用本插件内置图像",
  )
})

test("dense six-pool view renders all eighteen high-rarity cards without folding", async () => {
  const view = fixture()
  const templatePool = view.pools[0]
  view.pools = Array.from({ length: 6 }, (_, poolIndex) => ({
    ...templatePool,
    queryType: String(poolIndex + 1),
    name: `测试卡池 ${poolIndex + 1}`,
    total: 20,
    highCount: 3,
    items: Array.from({ length: 3 }, (_, itemIndex) => ({
      ...templatePool.items[0],
      name: `高稀有 ${poolIndex + 1}-${itemIndex + 1}`,
      asset: { url: view.assets.fallbackUrl, source: "builtin", kind: "character" },
    })),
  }))

  const { body, container } = await render(view)
  assert.equal(body.dataset.rendered, "true")
  assert.equal(countClass(container, "pool-panel"), 6)
  assert.equal(countClass(container, "result-card"), 18)
  assert.equal(textForClass(container, "asset-credit"), "高稀有图片均使用本插件内置图像")
  const serialized = JSON.stringify(container)
  assert.equal(serialized.includes("较早高稀有结果未展开"), false)
  assert.equal(serialized.includes("折叠"), false)
})

test("multi-page views show factual page progress without hiding page items", async () => {
  const view = fixture()
  view.pagination = { page: 2, total: 3, totalItems: 50 }

  const { body, container } = await render(view)
  const serialized = JSON.stringify(container)
  assert.equal(body.dataset.rendered, "true")
  assert.equal(countClass(container, "result-card"), 2)
  assert.equal(serialized.includes("第 2 / 3 页"), true)
  assert.equal(serialized.includes("第 2 / 3 页 · 共 50 个五星结果"), true)
  assert.equal(serialized.includes("本页 1 / 全池 1 个五星结果"), true)
  assert.equal(serialized.includes("未展开"), false)
  assert.equal(serialized.includes("折叠"), false)
})

test("Departure Warp renders a finite one-shot guarantee instead of repeatable pity", async () => {
  const consumedView = fixture()
  consumedView.game = "starrail"
  consumedView.pools = [{
    ...consumedView.pools[0],
    queryType: "2",
    name: "始发跃迁",
    total: 50,
    highCount: 2,
    currentPity: undefined,
    pityCap: 50,
    pityPercent: undefined,
    pityMode: "consumed",
    guaranteePulls: 10,
    extraHighCount: 1,
    items: [
      {
        ...consumedView.pools[0].items[0],
        pulls: 30,
        pullPrefix: "第",
        pullLuck: { label: "额外金", tone: "lucky" },
      },
      {
        ...consumedView.pools[0].items[0],
        pulls: 10,
        pullPrefix: "第",
      },
    ],
  }]

  const consumed = await render(consumedView)
  assert.equal(textForClass(consumed.container, "pity-current"), "始发保底 已完成")
  assert.equal(textForClass(consumed.container, "pity-cap"), "首金第 10 抽")
  assert.equal(textForClass(consumed.container, "pool-upoff"), "另有 1 个额外五星")
  assert.equal(countClass(consumed.container, "pity-track"), 0)
  assert.equal(countClass(consumed.container, "pull-prefix"), 2)

  const finiteView = fixture()
  finiteView.game = "starrail"
  finiteView.pools = [{
    ...finiteView.pools[2],
    queryType: "2",
    name: "始发跃迁",
    total: 40,
    currentPity: 40,
    pityCap: 50,
    pityPercent: 80,
    pityMode: "finite",
    extraHighCount: 0,
  }]
  const finite = await render(finiteView)
  assert.equal(textForClass(finite.container, "pity-current"), "始发进度 40")
  assert.equal(textForClass(finite.container, "pity-cap"), "/ 50")
  assert.equal(countClass(finite.container, "pity-track"), 1)
})
