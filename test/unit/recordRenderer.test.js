import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import {
  recordRenderData,
  renderRecordImage,
  resolveRecordViewAssets,
} from "../../src/adapters/yunzai/recordRenderer.js"

function view() {
  return {
    game: "genshin",
    uid: "123456789",
    pools: [
      {
        queryType: "301",
        items: [{ name: "</script><script>alert(1)</script>", itemType: "角色" }],
      },
    ],
  }
}

test("builds a local-only TRSS Puppeteer render contract", () => {
  const pluginRoot = path.resolve("fixture-plugin")
  const data = recordRenderData(view(), { pluginRoot })
  assert.equal(data.tplFile, path.join(pluginRoot, "resources", "records", "genshin.html"))
  assert.equal(data.cssUrl.startsWith("file:"), true)
  assert.equal(data.scriptUrl.startsWith("file:"), true)
  assert.equal(data.viewJson.includes("</script>"), false)
  assert.match(data.viewJson, /item-fallback\.webp/)
  assert.equal(data.imgType, "jpeg")
  assert.equal(data.quality, 90)
  assert.match(data.saveId, /^[a-f0-9]{20}$/)
  assert.equal(Object.hasOwn(data, "pageGotoParams"), false)

  const firstPage = recordRenderData(
    { ...view(), pagination: { page: 1, total: 2, totalItems: 25 } },
    { pluginRoot },
  )
  const repeatedFirstPage = recordRenderData(
    { ...view(), pagination: { page: 1, total: 2, totalItems: 25 } },
    { pluginRoot },
  )
  const secondPage = recordRenderData(
    { ...view(), pagination: { page: 2, total: 2, totalItems: 25 } },
    { pluginRoot },
  )
  assert.equal(firstPage.saveId, repeatedFirstPage.saveId)
  assert.equal(firstPage.saveId, secondPage.saveId)
})

test("decorates pool items through an injected local asset resolver", async () => {
  const calls = []
  await renderRecordImage(
    {
      screenshot: async (_name, data) => {
        calls.push(JSON.parse(data.viewJson))
        return { type: "image", data: "fixture" }
      },
    },
    view(),
    {
      pluginRoot: path.resolve("fixture-plugin"),
      assetResolver: {
        resolve: async (game, item) => ({
          url: "data:image/webp;base64,bWlhbw==",
          source: "miao-plugin",
          kind: item.itemType === "角色" ? "character" : "unknown",
          game,
        }),
      },
    },
  )

  assert.equal(calls[0].pools[0].items[0].asset.source, "miao-plugin")
  assert.equal(calls[0].pools[0].items[0].asset.kind, "character")
  assert.equal(calls[0].assets.fallbackUrl.startsWith("file:"), true)
})

test("deduplicates repeated local images into a bounded view-level asset catalog", async () => {
  let resolutions = 0
  const input = view()
  input.pools[0].items = [
    { itemId: "10000046", name: "胡桃", itemType: "角色", itemKind: "character" },
    { itemId: "10000046", name: "胡桃", itemType: "角色", itemKind: "character" },
  ]
  const resolved = await resolveRecordViewAssets(input, {
    assetResolver: {
      resolve: async () => {
        resolutions += 1
        return {
          url: "data:image/webp;base64,bWlhbw==",
          source: "miao-plugin",
          kind: "character",
          matchedBy: "item-id",
        }
      },
    },
  })

  assert.equal(resolutions, 1)
  assert.equal(Object.keys(resolved.assets.catalog).length, 1)
  assert.equal(resolved.pools[0].items[0].asset.key, "asset-1")
  assert.equal(resolved.pools[0].items[1].asset.key, "asset-1")
  assert.equal(JSON.stringify(resolved).match(/data:image\/webp/g).length, 1)

  const budgeted = await resolveRecordViewAssets(input, {
    maxAssetCatalogCharacters: 0,
    assetResolver: {
      resolve: async () => ({
        url: "data:image/webp;base64,bWlhbw==",
        source: "miao-plugin",
        kind: "character",
      }),
    },
  })
  assert.deepEqual(budgeted.assets.catalog, {})
  assert.equal(budgeted.pools[0].items[0].asset.source, "builtin")
  assert.equal(budgeted.pools[0].items[0].asset.matchedBy, "asset-budget")
})

test("falls back to the bundled image when optional asset resolution times out", async t => {
  const diagnostics = []
  globalThis.logger = { warn: message => diagnostics.push(message) }
  t.after(() => delete globalThis.logger)

  const result = await renderRecordImage(
    { screenshot: async () => ({ type: "image", data: "fixture" }) },
    view(),
    {
      pluginRoot: path.resolve("fixture-plugin"),
      assetTimeoutMs: 5,
      assetResolver: { resolve: async () => new Promise(() => {}) },
    },
  )

  assert.deepEqual(result, { type: "image", data: "fixture" })
  assert.equal(diagnostics.length, 1)
  assert.match(diagnostics[0], /超过 5ms/)
  assert.match(diagnostics[0], /内置图像/)

  await renderRecordImage(
    { screenshot: async () => ({ type: "image", data: "fixture" }) },
    view(),
    {
      pluginRoot: path.resolve("fixture-plugin"),
      assetTimeoutMs: 5,
      assetResolver: { resolve: async () => new Promise(() => {}) },
    },
  )
  assert.equal(diagnostics.length, 1)
})

test("reports an asset timeout and lets later pages skip further asset work", async () => {
  let timedOut = false
  let resolutions = 0
  const renderer = { screenshot: async () => ({ type: "image", data: "fixture" }) }
  const assetResolver = {
    resolve: async () => {
      resolutions += 1
      return new Promise(() => {})
    },
  }

  await renderRecordImage(renderer, view(), {
    assetTimeoutMs: 5,
    assetResolver,
    onAssetTimeout: () => {
      timedOut = true
    },
  })
  assert.equal(timedOut, true)
  assert.equal(resolutions, 1)

  await renderRecordImage(renderer, view(), {
    assetResolver,
    skipAssetResolution: timedOut,
  })
  assert.equal(resolutions, 1)
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

test("restarts after a never-settling screenshot and allows the next screenshot to run", async () => {
  let screenshotCalls = 0
  const restartCalls = []
  const renderer = {
    screenshot: async () => {
      screenshotCalls += 1
      if (screenshotCalls === 1) return new Promise(() => {})
      return { type: "image", data: "recovered" }
    },
    restart: async force => {
      restartCalls.push(force)
    },
  }

  await assert.rejects(
    renderRecordImage(renderer, view(), {
      skipAssetResolution: true,
      screenshotTimeoutMs: 5,
      rendererRecoveryTimeoutMs: 50,
    }),
    error => error?.code === "RENDER_EXECUTION_FAILED" && error?.causeName === "TimeoutError",
  )
  assert.deepEqual(restartCalls, [true])

  const result = await renderRecordImage(renderer, view(), {
    skipAssetResolution: true,
    screenshotTimeoutMs: 50,
  })
  assert.deepEqual(result, { type: "image", data: "recovered" })
  assert.equal(screenshotCalls, 2)
})

test("observes a stale screenshot rejection after the watchdog has fired", async () => {
  let rejectStaleScreenshot
  const staleScreenshot = new Promise((_resolve, reject) => {
    rejectStaleScreenshot = reject
  })
  const renderer = {
    screenshot: async () => staleScreenshot,
    restart: async () => {},
  }

  await assert.rejects(
    renderRecordImage(renderer, view(), {
      skipAssetResolution: true,
      screenshotTimeoutMs: 5,
      rendererRecoveryTimeoutMs: 50,
    }),
    error => error?.code === "RENDER_EXECUTION_FAILED" && error?.causeName === "TimeoutError",
  )

  rejectStaleScreenshot(new Error("late screenshot rejection"))
  await new Promise(resolve => setImmediate(resolve))
})

test("bounds recovery when renderer restart never settles", { timeout: 1_000 }, async () => {
  let restartCalls = 0
  const renderer = {
    screenshot: async () => new Promise(() => {}),
    restart: async () => {
      restartCalls += 1
      return new Promise(() => {})
    },
  }

  await assert.rejects(
    renderRecordImage(renderer, view(), {
      skipAssetResolution: true,
      screenshotTimeoutMs: 5,
      rendererRecoveryTimeoutMs: 5,
    }),
    error => error?.code === "RENDER_EXECUTION_FAILED" && error?.causeName === "TimeoutError",
  )
  assert.equal(restartCalls, 1)
})
