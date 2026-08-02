import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import {
  recordRenderData,
  renderRecordImage,
} from "../../src/adapters/yunzai/recordRenderer.js"

function view() {
  return {
    game: "genshin",
    uid: "123456789",
    recent: [{ name: "</script><script>alert(1)</script>" }],
  }
}

test("builds a local-only TRSS Puppeteer render contract", () => {
  const pluginRoot = path.resolve("fixture-plugin")
  const data = recordRenderData(view(), { pluginRoot })
  assert.equal(data.tplFile, path.join(pluginRoot, "resources", "records", "genshin.html"))
  assert.equal(data.cssUrl.startsWith("file:"), true)
  assert.equal(data.scriptUrl.startsWith("file:"), true)
  assert.equal(data.viewJson.includes("</script>"), false)
  assert.equal(data.imgType, "jpeg")
  assert.equal(data.quality, 90)
  assert.match(data.saveId, /^[a-f0-9]{20}$/)
})

test("uses the TRSS screenshot adapter and rejects an empty render", async () => {
  const calls = []
  const image = { type: "image", data: "fixture" }
  const result = await renderRecordImage(
    {
      screenshot: async (name, data) => {
        calls.push({ name, data })
        return image
      },
    },
    view(),
    { pluginRoot: path.resolve("fixture-plugin") },
  )
  assert.equal(result, image)
  assert.equal(calls[0].name, "xinghan-gacha-records")
  assert.equal(Object.isFrozen(calls[0].data), false)
  await assert.rejects(
    renderRecordImage({ screenshot: async () => false }, view()),
    error => error?.code === "RENDER_UNAVAILABLE",
  )
})

test("passes mutable render data and wraps a modern Puppeteer Buffer as an image segment", async context => {
  globalThis.segment = {
    image: buffer => ({ type: "image", bytes: buffer.length }),
  }
  context.after(() => delete globalThis.segment)

  const result = await renderRecordImage(
    {
      screenshot: async (_name, data) => {
        data.resPath = "./resources/"
        return Buffer.from("fixture-image")
      },
    },
    view(),
    { pluginRoot: path.resolve("fixture-plugin") },
  )

  assert.deepEqual(result, { type: "image", bytes: 13 })
})

test("normalizes renderer exceptions without exposing their messages", async () => {
  await assert.rejects(
    renderRecordImage(
      {
        screenshot: async () => {
          throw new TypeError("sensitive local renderer detail")
        },
      },
      view(),
    ),
    error =>
      error?.code === "RENDER_EXECUTION_FAILED" &&
      error?.causeName === "TypeError" &&
      !error.message.includes("sensitive"),
  )
})
