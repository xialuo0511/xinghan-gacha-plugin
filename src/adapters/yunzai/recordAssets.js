import { readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

const DEFAULT_FALLBACK_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const MAX_ASSET_BYTES = 1024 * 1024
const MAX_METADATA_BYTES = 8 * 1024 * 1024
const MAX_FALLBACK_DIRECTORIES = 2048
const MAX_IMAGE_CACHE_CHARACTERS = 8 * 1024 * 1024
const NEGATIVE_CACHE_MS = 60_000
const POSITIVE_CACHE_MS = 5 * 60_000

const GAME_META_DIRECTORIES = Object.freeze({
  genshin: "meta-gs",
  starrail: "meta-sr",
})

const IMAGE_CANDIDATES = Object.freeze({
  character: Object.freeze([
    path.join("imgs", "face.webp"),
    path.join("imgs", "face.png"),
    path.join("imgs", "face.jpg"),
    path.join("imgs", "face.jpeg"),
    path.join("imgs", "face-q.webp"),
    path.join("imgs", "card.webp"),
  ]),
  weapon: Object.freeze([
    "icon.webp",
    "icon.png",
    "icon.jpg",
    "icon.jpeg",
    path.join("imgs", "icon.webp"),
    "gacha.webp",
  ]),
})

const ZZZ_CATALOGS = Object.freeze({
  character: Object.freeze({
    file: "PartnerId2Data.json",
    idFields: Object.freeze(["id", "Id", "PartnerId", "partner_id"]),
    nameFields: Object.freeze([
      "name", "Name", "CHS", "chs", "full_name", "en_name", "EN", "KO", "JA", "KR", "JP",
    ]),
  }),
  weapon: Object.freeze({
    file: "WeaponId2Data.json",
    idFields: Object.freeze(["id", "Id", "WeaponId", "weapon_id"]),
    nameFields: Object.freeze(["name", "Name", "CHS", "chs", "en_name", "EN", "KO", "JA", "KR", "JP"]),
  }),
  bangboo: Object.freeze({
    file: "BangbooId2Data.json",
    idFields: Object.freeze(["id", "Id", "BangbooId", "bangboo_id"]),
    nameFields: Object.freeze(["name", "Name", "CHS", "chs", "en_name", "EN", "KO", "JA", "KR", "JP"]),
  }),
})

const EMPTY_INDEX = Object.freeze({
  byId: new Map(),
  byName: new Map(),
  kindRoots: new Map(),
})

function isContained(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
}

function normalizeItemId(value) {
  const itemId = String(value ?? "").normalize("NFKC").trim()
  return /^\d{1,20}$/.test(itemId) ? itemId : undefined
}

function normalizeName(value) {
  const name = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[•・‧]/g, "·")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("zh-CN")
  if (!name || name.length > 100 || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    return undefined
  }
  return name
}

function safeDirectoryName(value) {
  const name = String(value ?? "").normalize("NFKC").trim()
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    return undefined
  }
  return name
}

function assetKind(record = {}) {
  const explicitKind = String(record.itemKind ?? "").trim()
  if (["character", "weapon", "bangboo"].includes(explicitKind)) return explicitKind

  const itemType = String(record.itemType ?? record.item_type ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN")
  if (["邦布", "bangboo"].some(label => itemType.includes(label))) return "bangboo"
  if (["武器", "光锥", "音擎", "weapon", "light cone", "w-engine"].some(label => itemType.includes(label))) {
    return "weapon"
  }
  if (["角色", "代理人", "character", "agent"].some(label => itemType.includes(label))) return "character"

  const gachaType = String(record.gachaType ?? record.gacha_type ?? record.poolQueryType ?? "")
  if (["302", "12", "22", "3", "103"].includes(gachaType)) return "weapon"
  if (gachaType === "5") return "bangboo"
  if (gachaType) return "character"
  return "unknown"
}

function fallbackUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return DEFAULT_FALLBACK_DATA_URL
  const candidate = value.trim()
  if (/^data:image\/(?:avif|gif|jpeg|png|webp)(?:;[^,]*)?,/i.test(candidate)) return candidate
  if (/^file:/i.test(candidate)) {
    try {
      const url = new URL(candidate)
      return url.protocol === "file:" ? url.href : DEFAULT_FALLBACK_DATA_URL
    } catch {
      return DEFAULT_FALLBACK_DATA_URL
    }
  }
  const hasNonWindowsScheme = /^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^[a-z]:[\\/]/i.test(candidate)
  return hasNonWindowsScheme ? DEFAULT_FALLBACK_DATA_URL : pathToFileURL(path.resolve(candidate)).href
}

function uniquePaths(values) {
  const seen = new Set()
  return values.filter(value => {
    if (typeof value !== "string" || value.trim() === "") return false
    const resolved = path.resolve(value)
    const key = process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function safeRealPath(candidate, containmentRoot, expectedType) {
  try {
    const resolved = await realpath(candidate)
    if (!isContained(containmentRoot, resolved)) return undefined
    const details = await stat(resolved)
    if (expectedType === "directory" && !details.isDirectory()) return undefined
    if (expectedType === "file" && !details.isFile()) return undefined
    return Object.freeze({ path: resolved, stat: details })
  } catch {
    return undefined
  }
}

async function safeDirectories(directory, containmentRoot) {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const directories = []
    for (const entry of entries
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
      .slice(0, MAX_FALLBACK_DIRECTORIES)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const child = await safeRealPath(path.join(directory, entry.name), containmentRoot, "directory")
      if (child) directories.push(Object.freeze({ name: entry.name, path: child.path }))
    }
    return directories
  } catch {
    return []
  }
}

async function findImage(itemDirectory, containmentRoot, kind) {
  for (const relative of IMAGE_CANDIDATES[kind] ?? []) {
    const candidate = await safeRealPath(path.join(itemDirectory, relative), containmentRoot, "file")
    if (candidate && candidate.stat.size <= MAX_ASSET_BYTES) return candidate
  }
  return undefined
}

async function findNamedImage(root, relatives) {
  for (const relative of relatives) {
    const candidate = await safeRealPath(path.join(root, relative), root, "file")
    if (candidate && candidate.stat.size <= MAX_ASSET_BYTES) return candidate
  }
  return undefined
}

async function imageDataUrl(candidate) {
  try {
    const buffer = await readFile(candidate.path)
    if (buffer.length > MAX_ASSET_BYTES) return undefined
    let mime
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      mime = "image/webp"
    } else if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      mime = "image/png"
    } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      mime = "image/jpeg"
    } else {
      return undefined
    }
    return `data:${mime};base64,${buffer.toString("base64")}`
  } catch {
    return undefined
  }
}

async function jsonObject(candidatePath, containmentRoot) {
  const candidate = await safeRealPath(candidatePath, containmentRoot, "file")
  if (!candidate || candidate.stat.size > MAX_METADATA_BYTES) return undefined
  try {
    const buffer = await readFile(candidate.path)
    if (buffer.length > MAX_METADATA_BYTES) return undefined
    const value = JSON.parse(buffer.toString("utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

async function metadata(itemDirectory, containmentRoot) {
  return jsonObject(path.join(itemDirectory, "data.json"), containmentRoot)
}

function scalarValues(values) {
  return values.flatMap(value => {
    if (Array.isArray(value)) return scalarValues(value)
    if (value && typeof value === "object") return scalarValues(Object.values(value))
    return [value]
  }).filter(value => ["string", "number"].includes(typeof value))
}

function addIndexes(index, asset, directoryName, data, kind) {
  const ids = scalarValues([data?.id, data?.itemId, data?.item_id, data?.data?.id])
  const names = scalarValues([directoryName, data?.name, data?.cn, data?.names, data?.aliases])

  for (const value of ids) {
    const id = normalizeItemId(value)
    if (id && !index.byId.has(`${kind}:${id}`)) index.byId.set(`${kind}:${id}`, asset)
  }
  for (const value of names) {
    const name = normalizeName(value)
    if (name && !index.byName.has(`${kind}:${name}`)) index.byName.set(`${kind}:${name}`, asset)
  }
}

function miaoAsset(directory, root, kind) {
  return Object.freeze({ directory, root, source: "miao-plugin", kind })
}

async function addDirectoryItem(index, itemDirectory, directoryName, kind, miaoRoot) {
  const data = await metadata(itemDirectory, miaoRoot)
  addIndexes(index, miaoAsset(itemDirectory, miaoRoot, kind), directoryName, data, kind)
}

async function indexAggregate(index, metadataRoot, itemRoot, kind, miaoRoot, categoryField) {
  const data = await metadata(metadataRoot, miaoRoot)
  if (!data) return 0
  let added = 0

  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const name = safeDirectoryName(value.name)
    const category = categoryField ? safeDirectoryName(value[categoryField]) : undefined
    if (!name || (categoryField && !category)) continue
    const directory = path.join(itemRoot, ...(category ? [category] : []), name)
    addIndexes(index, miaoAsset(directory, miaoRoot, kind), name, { ...value, id: value.id ?? key }, kind)
    added += 1
  }
  return added
}

async function indexKind(index, kindRoot, kind, miaoRoot) {
  const aggregateCount = await indexAggregate(
    index,
    kindRoot,
    kindRoot,
    kind,
    miaoRoot,
    kind === "weapon" ? "type" : undefined,
  )
  if (aggregateCount > 0) return

  const firstLevel = await safeDirectories(kindRoot, miaoRoot)
  if (kind === "character") {
    for (const item of firstLevel) await addDirectoryItem(index, item.path, item.name, kind, miaoRoot)
    return
  }

  for (const categoryOrItem of firstLevel) {
    const categoryCount = await indexAggregate(
      index,
      categoryOrItem.path,
      categoryOrItem.path,
      kind,
      miaoRoot,
    )
    if (categoryCount > 0) continue
    const items = await safeDirectories(categoryOrItem.path, miaoRoot)
    if (items.length === 0) {
      await addDirectoryItem(index, categoryOrItem.path, categoryOrItem.name, kind, miaoRoot)
      continue
    }
    for (const item of items) await addDirectoryItem(index, item.path, item.name, kind, miaoRoot)
  }
}

function addDirectoryName(index, item, kind, miaoRoot) {
  const name = normalizeName(item.name)
  if (!name || index.byName.has(`${kind}:${name}`)) return
  index.byName.set(`${kind}:${name}`, miaoAsset(item.path, miaoRoot, kind))
}

async function indexDirectoryNames(kindRoot, kind, miaoRoot) {
  const index = { byId: new Map(), byName: new Map(), kindRoots: new Map() }
  const firstLevel = await safeDirectories(kindRoot, miaoRoot)
  if (kind === "character") {
    for (const item of firstLevel) addDirectoryName(index, item, kind, miaoRoot)
    return Object.freeze(index)
  }

  for (const categoryOrItem of firstLevel) {
    const items = await safeDirectories(categoryOrItem.path, miaoRoot)
    if (items.length === 0) {
      addDirectoryName(index, categoryOrItem, kind, miaoRoot)
      continue
    }
    for (const item of items) addDirectoryName(index, item, kind, miaoRoot)
  }
  return Object.freeze(index)
}

function zzzCatalogEntry(kind, key, value) {
  const config = ZZZ_CATALOGS[kind]
  const id = scalarValues([value?.id, ...config.idFields.map(field => value?.[field]), key])
    .map(normalizeItemId)
    .find(Boolean)
  const names = scalarValues(config.nameFields.map(field => value?.[field]))
    .map(normalizeName)
    .filter(Boolean)
  const sprite = scalarValues([value?.sprite_id, value?.spriteId, value?.SpriteId])
    .map(normalizeItemId)
    .find(Boolean)
  const codeName = safeDirectoryName(value?.CodeName ?? value?.codeName ?? value?.code_name)
  return Object.freeze({ id, names, sprite, codeName, source: "ZZZ-Plugin", kind })
}

function addZzzIndexes(index, entry) {
  if (entry.id && !index.byId.has(entry.id)) index.byId.set(entry.id, entry)
  for (const name of entry.names) {
    if (!index.byName.has(name)) index.byName.set(name, entry)
  }
}

function zzzImagePaths(kind, entry) {
  const relatives = []
  if (kind === "character" && entry.id) {
    relatives.push(
      path.join("resources", "images", "square_avatar", `role_square_avatar_${entry.id}.png`),
      path.join("resources", "images", "square_avatar", `role_square_avatar_${entry.id}.webp`),
    )
  }
  if (kind === "character" && entry.sprite) {
    relatives.push(
      path.join("resources", "images", "hakush", "square_avatar", `IconRoleCrop${entry.sprite}.webp`),
      path.join("resources", "images", "nanoka", "square_avatar", `IconRoleCrop${entry.sprite}.webp`),
    )
  }
  if (kind === "weapon" && entry.codeName) {
    relatives.push(
      path.join("resources", "images", "weapon", `${entry.codeName}_High.png`),
      path.join("resources", "images", "weapon", `${entry.codeName}_High.webp`),
      path.join("resources", "images", "hakush", "weapon", `${entry.codeName}.webp`),
      path.join("resources", "images", "nanoka", "weapon", `${entry.codeName}.webp`),
    )
  }
  if (kind === "bangboo" && entry.id) {
    relatives.push(
      path.join("resources", "images", "bangboo_square_avatar", `bangboo_rectangle_avatar_${entry.id}.png`),
      path.join("resources", "images", "bangboo_square_avatar", `bangboo_rectangle_avatar_${entry.id}.webp`),
    )
  }
  if (kind === "bangboo" && entry.sprite) {
    relatives.push(
      path.join("resources", "images", "hakush", "bangboo_square_avatar", `BangbooGarageRole${entry.sprite}.webp`),
      path.join("resources", "images", "nanoka", "bangboo_square_avatar", `BangbooGarageRole${entry.sprite}.webp`),
    )
  }
  return relatives
}

function indexSize(index) {
  return index.byId.size + index.byName.size
}

function encodedImageCharacters(candidate) {
  return Math.ceil(candidate.stat.size / 3) * 4 + 64
}

function imageCacheKey(candidate) {
  return `${candidate.path}\u0000${candidate.stat.size}\u0000${candidate.stat.mtimeMs}`
}

export class RecordAssetResolver {
  constructor({ pluginRoot, miaoRoot, zzzRoot, fallbackAsset } = {}) {
    const resolvedPluginRoot = path.resolve(pluginRoot ?? path.join(process.cwd(), "plugins", "xinghan-gacha-plugin"))
    const pluginsRoot = path.dirname(resolvedPluginRoot)
    const configuredRoot = miaoRoot ?? process.env.MIAO_PLUGIN_ROOT
    this.miaoCandidates = uniquePaths(configuredRoot
      ? [configuredRoot]
      : [
          path.join(pluginsRoot, "miao-plugin"),
          path.join(process.cwd(), "plugins", "miao-plugin"),
          path.join(path.dirname(process.cwd()), "miao-plugin"),
        ])
    const configuredZzzRoot = zzzRoot ?? process.env.ZZZ_PLUGIN_ROOT
    this.zzzCandidates = uniquePaths(configuredZzzRoot
      ? [configuredZzzRoot]
      : [
          path.join(pluginsRoot, "ZZZ-Plugin"),
          path.join(pluginsRoot, "zzz-plugin"),
          path.join(process.cwd(), "plugins", "ZZZ-Plugin"),
          path.join(process.cwd(), "plugins", "zzz-plugin"),
        ])
    this.fallback = fallbackUrl(fallbackAsset)
    this.rootCache = undefined
    this.zzzRootCache = undefined
    this.zzzCatalogCache = new Map()
    this.imagePromises = new Map()
    this.imageCacheCharacters = 0
    this.indexCache = new Map()
    this.miaoFallbackCache = new Map()
  }

  async resolve(game, record = {}) {
    const preferredKind = assetKind(record)
    const fallback = Object.freeze({
      url: this.fallback,
      source: "builtin",
      kind: preferredKind,
      matchedBy: "fallback",
    })
    if (game === "zzz") return (await this.#resolveZzz(record, preferredKind)) ?? fallback
    if (!Object.hasOwn(GAME_META_DIRECTORIES, game)) return fallback

    const index = await this.#indexFor(game)
    const searchKinds = preferredKind === "unknown"
      ? ["character", "weapon"]
      : [preferredKind, preferredKind === "character" ? "weapon" : "character"]
    const itemId = normalizeItemId(record.itemId ?? record.item_id)
    if (itemId) {
      for (const kind of searchKinds) {
        const match = index.byId.get(`${kind}:${itemId}`)
        const url = await this.#miaoUrl(match)
        if (url) return Object.freeze({ url, source: match.source, kind: match.kind, matchedBy: "item-id" })
        if (!match) continue

        const directoryName = normalizeName(path.basename(match.directory))
        if (!directoryName) continue
        const fallbackIndex = await this.#miaoFallbackFor(game, kind, index)
        const fallbackMatch = fallbackIndex.byName.get(`${kind}:${directoryName}`)
        const fallbackImageUrl = await this.#miaoUrl(fallbackMatch)
        if (fallbackImageUrl) {
          return Object.freeze({
            url: fallbackImageUrl,
            source: fallbackMatch.source,
            kind: fallbackMatch.kind,
            matchedBy: "item-id",
          })
        }
      }
    }

    const name = normalizeName(record.name ?? record.itemName ?? record.item_name)
    if (name) {
      for (const kind of searchKinds) {
        const match = index.byName.get(`${kind}:${name}`)
        const url = await this.#miaoUrl(match)
        if (url) return Object.freeze({ url, source: match.source, kind: match.kind, matchedBy: "exact-name" })

        const fallbackIndex = await this.#miaoFallbackFor(game, kind, index)
        const fallbackMatch = fallbackIndex.byName.get(`${kind}:${name}`)
        const fallbackImageUrl = await this.#miaoUrl(fallbackMatch)
        if (fallbackImageUrl) {
          return Object.freeze({
            url: fallbackImageUrl,
            source: fallbackMatch.source,
            kind: fallbackMatch.kind,
            matchedBy: "exact-name",
          })
        }
      }
    }
    return fallback
  }

  async #imageUrl(candidate) {
    if (!candidate) return undefined
    const key = imageCacheKey(candidate)
    const now = Date.now()
    for (const [cachedKey, entry] of this.imagePromises) {
      if (entry.expiresAt <= now || (entry.path === candidate.path && cachedKey !== key)) {
        this.#deleteImageCacheEntry(cachedKey)
      }
    }

    const cached = this.imagePromises.get(key)
    if (cached) {
      cached.expiresAt = now + POSITIVE_CACHE_MS
      this.imagePromises.delete(key)
      this.imagePromises.set(key, cached)
      return cached.promise
    }

    const entry = {
      path: candidate.path,
      characters: encodedImageCharacters(candidate),
      expiresAt: now + POSITIVE_CACHE_MS,
      promise: undefined,
    }
    entry.promise = imageDataUrl(candidate).then(url => {
      if (!url) {
        if (this.imagePromises.get(key) === entry) this.#deleteImageCacheEntry(key)
        return undefined
      }
      if (this.imagePromises.get(key) === entry) {
        this.imageCacheCharacters += url.length - entry.characters
        entry.characters = url.length
        this.#trimImageCache()
      }
      return url
    })
    this.imagePromises.set(key, entry)
    this.imageCacheCharacters += entry.characters
    this.#trimImageCache()
    return entry.promise
  }

  #deleteImageCacheEntry(key) {
    const entry = this.imagePromises.get(key)
    if (!entry) return
    this.imagePromises.delete(key)
    this.imageCacheCharacters = Math.max(0, this.imageCacheCharacters - entry.characters)
  }

  #trimImageCache() {
    while (this.imageCacheCharacters > MAX_IMAGE_CACHE_CHARACTERS && this.imagePromises.size > 0) {
      this.#deleteImageCacheEntry(this.imagePromises.keys().next().value)
    }
  }

  async #miaoUrl(match) {
    if (!match) return undefined
    const image = await findImage(match.directory, match.root, match.kind)
    return this.#imageUrl(image)
  }

  async #cachedRoot(cacheProperty, candidates) {
    const now = Date.now()
    const cached = this[cacheProperty]
    if (cached && cached.expiresAt > now) return cached.promise
    const entry = {
      expiresAt: now + NEGATIVE_CACHE_MS,
      promise: (async () => {
        for (const candidate of candidates) {
          try {
            const resolved = await realpath(candidate)
            if ((await stat(resolved)).isDirectory()) return resolved
          } catch {
            // Optional sibling plugins can be installed later; negative results expire.
          }
        }
        return undefined
      })(),
    }
    this[cacheProperty] = entry
    entry.promise.then(root => {
      entry.expiresAt = Date.now() + (root ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS)
    })
    return entry.promise
  }

  #miaoRoot() {
    return this.#cachedRoot("rootCache", this.miaoCandidates)
  }

  #zzzRoot() {
    return this.#cachedRoot("zzzRootCache", this.zzzCandidates)
  }

  async #indexFor(game) {
    const now = Date.now()
    const cached = this.indexCache.get(game)
    if (cached && cached.expiresAt > now) return cached.promise
    const entry = {
      expiresAt: now + NEGATIVE_CACHE_MS,
      promise: (async () => {
        const miaoRoot = await this.#miaoRoot()
        if (!miaoRoot) return EMPTY_INDEX
        const meta = await safeRealPath(
          path.join(miaoRoot, "resources", GAME_META_DIRECTORIES[game]),
          miaoRoot,
          "directory",
        )
        if (!meta) return EMPTY_INDEX

        const index = { byId: new Map(), byName: new Map(), kindRoots: new Map() }
        for (const kind of ["character", "weapon"]) {
          const root = await safeRealPath(path.join(meta.path, kind), miaoRoot, "directory")
          if (root) {
            index.kindRoots.set(kind, Object.freeze({ path: root.path, root: miaoRoot }))
            await indexKind(index, root.path, kind, miaoRoot)
          }
        }
        return Object.freeze(index)
      })().catch(() => EMPTY_INDEX),
    }
    this.indexCache.set(game, entry)
    entry.promise.then(index => {
      entry.expiresAt = Date.now() + (indexSize(index) > 0 ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS)
    })
    return entry.promise
  }

  async #miaoFallbackFor(game, kind, index) {
    const kindRoot = index.kindRoots.get(kind)
    if (!kindRoot) return EMPTY_INDEX
    const key = `${game}:${kind}`
    const now = Date.now()
    const cached = this.miaoFallbackCache.get(key)
    if (cached && cached.root === kindRoot.path && cached.expiresAt > now) return cached.promise
    const entry = {
      root: kindRoot.path,
      expiresAt: now + NEGATIVE_CACHE_MS,
      promise: indexDirectoryNames(kindRoot.path, kind, kindRoot.root).catch(() => EMPTY_INDEX),
    }
    this.miaoFallbackCache.set(key, entry)
    entry.promise.then(fallbackIndex => {
      entry.expiresAt = Date.now() + (
        indexSize(fallbackIndex) > 0 ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS
      )
    })
    return entry.promise
  }

  async #zzzCatalog(kind, zzzRoot) {
    const now = Date.now()
    const cached = this.zzzCatalogCache.get(kind)
    if (cached && cached.root === zzzRoot && cached.expiresAt > now) return cached.promise
    const entry = {
      root: zzzRoot,
      expiresAt: now + NEGATIVE_CACHE_MS,
      promise: (async () => {
        const config = ZZZ_CATALOGS[kind]
        const data = await jsonObject(path.join(zzzRoot, "resources", "map", config.file), zzzRoot)
        if (!data) return EMPTY_INDEX
        const index = { byId: new Map(), byName: new Map() }
        for (const [key, value] of Object.entries(data)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue
          addZzzIndexes(index, zzzCatalogEntry(kind, key, value))
        }
        return Object.freeze(index)
      })().catch(() => EMPTY_INDEX),
    }
    this.zzzCatalogCache.set(kind, entry)
    entry.promise.then(index => {
      entry.expiresAt = Date.now() + (indexSize(index) > 0 ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS)
    })
    return entry.promise
  }

  async #resolveZzz(record, preferredKind) {
    const zzzRoot = await this.#zzzRoot()
    if (!zzzRoot) return undefined
    const searchKinds = preferredKind === "unknown"
      ? ["character", "weapon", "bangboo"]
      : [preferredKind]
    const itemId = normalizeItemId(record.itemId ?? record.item_id)
    const name = normalizeName(record.name ?? record.itemName ?? record.item_name)

    for (const kind of searchKinds) {
      const catalog = await this.#zzzCatalog(kind, zzzRoot)
      let match = itemId ? catalog.byId.get(itemId) : undefined
      let matchedBy = match ? "item-id" : undefined
      if (!match && name) {
        match = catalog.byName.get(name)
        matchedBy = match ? "exact-name" : undefined
      }
      if (!match && itemId && ["character", "bangboo"].includes(kind)) {
        match = Object.freeze({
          id: itemId,
          names: Object.freeze([]),
          source: "ZZZ-Plugin",
          kind,
        })
        matchedBy = "item-id"
      }
      if (!match) continue
      const image = await findNamedImage(zzzRoot, zzzImagePaths(kind, match))
      const url = await this.#imageUrl(image)
      if (url) return Object.freeze({ url, source: match.source, kind, matchedBy })
    }
    return undefined
  }
}
