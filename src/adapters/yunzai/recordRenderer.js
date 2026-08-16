import { createHash } from "node:crypto"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { ProtocolError } from "../../protocol/http.js"
import { RecordAssetResolver } from "./recordAssets.js"

const TEMPLATE_FILES = Object.freeze({
  genshin: "genshin.html",
  starrail: "starrail.html",
  zzz: "zzz.html",
})

const resolverCache = new Map()
const DEFAULT_ASSET_TIMEOUT_MS = 5_000
const DEFAULT_SCREENSHOT_TIMEOUT_MS = 60_000
const DEFAULT_RENDERER_RECOVERY_TIMEOUT_MS = 15_000
const MAX_ASSET_CATALOG_CHARACTERS = 8 * 1024 * 1024
const ASSET_DIAGNOSTIC_INTERVAL_MS = 60_000
let lastAssetTimeoutDiagnosticAt = 0

function serializedView(view) {
  return JSON.stringify(view)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}

export function recordRenderData(view, { pluginRoot, fallbackUrl } = {}) {
  const root = pluginRoot ?? path.join(process.cwd(), "plugins", "xinghan-gacha-plugin")
  const resourceRoot = path.join(root, "resources", "records")
  const template = TEMPLATE_FILES[view?.game]
  if (!template) throw new RangeError("Unsupported record view game")
  // The global record render gate makes page writes strictly sequential. Reuse
  // one stable path so TRSS does not retain a new UID-bearing HTML file per page.
  const saveId = createHash("sha256")
    .update(`${view.game}:${view.uid}`, "utf8")
    .digest("hex")
    .slice(0, 20)
  const renderView = {
    ...view,
    assets: {
      ...view.assets,
      fallbackUrl:
        fallbackUrl ?? pathToFileURL(path.join(resourceRoot, "assets", "item-fallback.webp")).href,
    },
  }
  return Object.freeze({
    tplFile: path.join(resourceRoot, template),
    saveId,
    imgType: "jpeg",
    quality: 90,
    viewJson: serializedView(renderView),
    cssUrl: pathToFileURL(path.join(resourceRoot, "base.css")).href,
    scriptUrl: pathToFileURL(path.join(resourceRoot, "base.js")).href,
  })
}

function defaultAssetResolver(pluginRoot) {
  if (!resolverCache.has(pluginRoot)) {
    resolverCache.set(
      pluginRoot,
      new RecordAssetResolver({
        pluginRoot,
        fallbackAsset: path.join(pluginRoot, "resources", "records", "assets", "item-fallback.webp"),
      }),
    )
  }
  return resolverCache.get(pluginRoot)
}

function assetIdentity(game, item) {
  return [
    game,
    item?.itemKind,
    item?.itemType,
    item?.itemId ?? item?.item_id,
    item?.name ?? item?.itemName ?? item?.item_name,
  ].map(value => String(value ?? "")).join("\u0000")
}

function assetReference(asset, key) {
  return {
    ...(key ? { key } : {}),
    source: asset?.source ?? "builtin",
    kind: asset?.kind ?? "unknown",
    matchedBy: asset?.matchedBy ?? "fallback",
  }
}

function timeoutMilliseconds(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30_000) : DEFAULT_ASSET_TIMEOUT_MS
}

function screenshotTimeoutMilliseconds(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, 5 * 60_000)
    : DEFAULT_SCREENSHOT_TIMEOUT_MS
}

function recoveryTimeoutMilliseconds(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, 60_000)
    : DEFAULT_RENDERER_RECOVERY_TIMEOUT_MS
}

function assetTimeoutDiagnostic(timeoutMs) {
  const output = globalThis.logger?.warn ?? globalThis.logger?.info
  if (typeof output !== "function") return
  const now = Date.now()
  if (now - lastAssetTimeoutDiagnosticAt < ASSET_DIAGNOSTIC_INTERVAL_MS) return
  lastAssetTimeoutDiagnosticAt = now
  output.call(
    globalThis.logger,
    `[xinghan-gacha-plugin/records] 本地角色与装备素材解析超过 ${timeoutMs}ms，` +
      "本次截图改用内置图像；素材索引完成后下次会自动重试",
  )
}

async function withTimeout(promise, timeoutMs) {
  const timedOut = Symbol("operation-timeout")
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(timedOut), timeoutMs)
  })
  try {
    const result = await Promise.race([promise, timeout])
    return result === timedOut
      ? Object.freeze({ value: undefined, timedOut: true })
      : Object.freeze({ value: result, timedOut: false })
  } finally {
    clearTimeout(timer)
  }
}

async function recoverTimedOutRenderer(renderer, timeoutMs) {
  let recovery
  if (typeof renderer?.restart === "function") {
    recovery = Promise.resolve().then(() => renderer.restart(true))
  } else {
    const browser = renderer?.browser
    const close = browser?.close
    if (typeof close !== "function") return
    try {
      renderer.browser = false
    } catch {
      // Closing the browser is still useful when the renderer state is read-only.
    }
    recovery = Promise.resolve().then(() => close.call(browser))
  }

  // Promise.race observes the recovery rejection while it is pending. Keep an
  // explicit terminal handler as well because a timed-out recovery may reject later.
  void recovery.catch(() => {})
  try {
    await withTimeout(recovery, timeoutMs)
  } catch {
    // The original screenshot timeout remains the public failure.
  }
}

function renderExecutionFailure(causeName) {
  const failure = new ProtocolError(
    "RENDER_EXECUTION_FAILED",
    "Record screenshot renderer threw an exception",
  )
  failure.causeName = String(causeName ?? "Error")
  return failure
}

export async function resolveRecordViewAssets(view, options = {}) {
  const pluginRoot = options.pluginRoot ?? path.join(process.cwd(), "plugins", "xinghan-gacha-plugin")
  const resolver = options.assetResolver ?? defaultAssetResolver(pluginRoot)
  const identities = new Map()
  for (const pool of view.pools ?? []) {
    for (const item of pool.items ?? []) {
      const identity = assetIdentity(view.game, item)
      if (!identities.has(identity)) identities.set(identity, item)
    }
  }

  const maxCatalogCharacters = Number.isFinite(options.maxAssetCatalogCharacters)
    ? Math.max(0, options.maxAssetCatalogCharacters)
    : MAX_ASSET_CATALOG_CHARACTERS
  const catalog = {}
  const urlKeys = new Map()
  const references = new Map()
  let catalogCharacters = 0
  let assetNumber = 0

  // Resolve each unique displayed asset sequentially to avoid multiplying
  // filesystem reads and Base64 buffers when a long history is rendered.
  for (const [identity, item] of identities) {
    let asset
    try {
      asset = await resolver.resolve(view.game, item)
    } catch {
      asset = undefined
    }
    if (!asset || asset.source === "builtin" || typeof asset.url !== "string") {
      references.set(identity, assetReference(asset))
      continue
    }

    let key = urlKeys.get(asset.url)
    if (!key && catalogCharacters + asset.url.length <= maxCatalogCharacters) {
      assetNumber += 1
      key = `asset-${assetNumber}`
      catalog[key] = asset
      urlKeys.set(asset.url, key)
      catalogCharacters += asset.url.length
    }
    references.set(
      identity,
      key
        ? assetReference(asset, key)
        : assetReference({ kind: asset.kind, matchedBy: "asset-budget", source: "builtin" }),
    )
  }

  const pools = (view.pools ?? []).map(pool => ({
    ...pool,
    items: (pool.items ?? []).map(item => ({
      ...item,
      asset: references.get(assetIdentity(view.game, item)) ?? assetReference(),
    })),
  }))
  return {
    ...view,
    assets: { ...view.assets, catalog },
    pools,
  }
}

export async function renderRecordImage(renderer, view, options) {
  if (typeof renderer?.screenshot !== "function") {
    throw new ProtocolError("RENDER_UNAVAILABLE", "TRSS screenshot renderer is unavailable")
  }
  const pluginRoot = options?.pluginRoot ?? path.join(process.cwd(), "plugins", "xinghan-gacha-plugin")
  const assetTimeoutMs = timeoutMilliseconds(options?.assetTimeoutMs)
  const screenshotTimeoutMs = screenshotTimeoutMilliseconds(options?.screenshotTimeoutMs)
  const rendererRecoveryTimeoutMs = recoveryTimeoutMilliseconds(options?.rendererRecoveryTimeoutMs)
  let resolvedView
  if (!options?.skipAssetResolution) {
    const assetResult = await withTimeout(
      resolveRecordViewAssets(view, { ...options, pluginRoot }),
      assetTimeoutMs,
    )
    resolvedView = assetResult.value
    if (assetResult.timedOut) {
      assetTimeoutDiagnostic(assetTimeoutMs)
      try {
        options?.onAssetTimeout?.()
      } catch {
        // A diagnostic hook must never block the fallback screenshot.
      }
    }
  }
  const renderData = { ...recordRenderData(resolvedView ?? view, { ...options, pluginRoot }) }
  const screenshot = Promise.resolve().then(() =>
    renderer.screenshot("xinghan-gacha-records", renderData),
  )
  // A screenshot can reject after the watchdog has already recovered Chromium.
  // Observe that late rejection so it never becomes an unhandled process error.
  void screenshot.catch(() => {})

  let screenshotResult
  try {
    // Yunzai Renderer.dealTpl() adds resPath to this object before rendering.
    // Keep recordRenderData immutable for callers, but pass the renderer a mutable contract.
    screenshotResult = await withTimeout(screenshot, screenshotTimeoutMs)
  } catch (error) {
    throw renderExecutionFailure(error?.name)
  }
  if (screenshotResult.timedOut) {
    await recoverTimedOutRenderer(renderer, rendererRecoveryTimeoutMs)
    throw renderExecutionFailure("TimeoutError")
  }
  const image = screenshotResult.value
  if (!image) throw new ProtocolError("RENDER_UNAVAILABLE", "Record screenshot failed")
  if (Buffer.isBuffer(image)) {
    if (typeof globalThis.segment?.image !== "function") {
      throw new ProtocolError("RENDER_MESSAGE_UNAVAILABLE", "Image message builder is unavailable")
    }
    return globalThis.segment.image(image)
  }
  return image
}
