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
    pageGotoParams: Object.freeze({ timeout: 30_000, waitUntil: "load" }),
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

async function withAssetTimeout(promise, timeoutMs) {
  const timedOut = Symbol("asset-timeout")
  let timer
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(timedOut), timeoutMs)
  })
  try {
    const result = await Promise.race([promise, timeout])
    return result === timedOut ? undefined : result
  } finally {
    clearTimeout(timer)
  }
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

  // At most twelve high-rarity cards are rendered. Resolve their unique assets
  // sequentially to avoid multiplying filesystem reads and Base64 buffers.
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
  const resolvedView = await withAssetTimeout(
    resolveRecordViewAssets(view, { ...options, pluginRoot }),
    assetTimeoutMs,
  )
  if (!resolvedView) assetTimeoutDiagnostic(assetTimeoutMs)
  let image
  try {
    // Yunzai Renderer.dealTpl() adds resPath to this object before rendering.
    // Keep recordRenderData immutable for callers, but pass the renderer a mutable contract.
    const renderData = { ...recordRenderData(resolvedView ?? view, { ...options, pluginRoot }) }
    image = await renderer.screenshot("xinghan-gacha-records", renderData)
  } catch (error) {
    const failure = new ProtocolError(
      "RENDER_EXECUTION_FAILED",
      "Record screenshot renderer threw an exception",
    )
    failure.causeName = String(error?.name ?? "Error")
    throw failure
  }
  if (!image) throw new ProtocolError("RENDER_UNAVAILABLE", "Record screenshot failed")
  if (Buffer.isBuffer(image)) {
    if (typeof globalThis.segment?.image !== "function") {
      throw new ProtocolError("RENDER_MESSAGE_UNAVAILABLE", "Image message builder is unavailable")
    }
    return globalThis.segment.image(image)
  }
  return image
}
