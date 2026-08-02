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
}

function countClass(node, className) {
  const current = String(node.className).split(/\s+/).includes(className) ? 1 : 0
  return current + node.children.reduce((sum, child) => sum + countClass(child, className), 0)
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
    luck: { label: "欧皇", tone: "lucky", message: "测试欧气" },
    pools: [
      {
        name: "角色活动祈愿",
        total: 1,
        highCount: 1,
        currentPity: 0,
        pityPercent: 0,
        upCount: 1,
        offCount: 0,
        latestHigh: "</script><script>alert(1)</script>",
      },
    ],
    highlights: [
      {
        name: "</script><script>alert(1)</script>",
        poolName: "角色活动祈愿",
        pulls: 20,
        pullLuck: { label: "欧皇", tone: "lucky" },
        time: "2026-08-02 11:00:00",
        status,
      },
    ],
    disclaimer: "测试说明",
  }
}

test("shared record page script builds a complete DOM without HTML injection", async () => {
  const source = await readFile(new URL("../../resources/records/base.js", import.meta.url), "utf8")
  const body = new FakeElement("body")
  const container = new FakeElement("main")
  const data = new FakeElement("script")
  data.textContent = JSON.stringify(fixture())
  const document = {
    body,
    createElement: tag => new FakeElement(tag),
    getElementById: id => (id === "container" ? container : id === "record-data" ? data : undefined),
  }

  vm.runInNewContext(source, { document, JSON, Math, Number, String })

  assert.equal(body.dataset.rendered, "true")
  assert.equal(container.children.length, 5)
  assert.equal(countClass(container, "pool-card"), 1)
  assert.equal(countClass(container, "highlight-card"), 1)
  assert.equal(countClass(container, "record-row"), 0)
  assert.equal(countClass(container, "pull-number"), 1)
  assert.equal(countClass(container, "pull-lucky"), 1)
  const serialized = JSON.stringify(container)
  assert.equal(serialized.includes("alert(1)"), true)
  assert.equal(serialized.includes("innerHTML"), false)
})
