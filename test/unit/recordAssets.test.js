import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { RecordAssetResolver } from "../../src/adapters/yunzai/recordAssets.js"

const FALLBACK = "data:image/png;base64,ZmFsbGJhY2s="
const WEBP_FIXTURE = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x66,
])
const WEBP_URL = `data:image/webp;base64,${WEBP_FIXTURE.toString("base64")}`
const PNG_FIXTURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_URL = `data:image/png;base64,${PNG_FIXTURE.toString("base64")}`

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "xinghan-record-assets-"))
  const pluginRoot = path.join(root, "plugins", "xinghan-gacha-plugin")
  const miaoRoot = path.join(root, "plugins", "miao-plugin")
  const zzzRoot = path.join(root, "plugins", "ZZZ-Plugin")
  await mkdir(pluginRoot, { recursive: true })
  return { root, pluginRoot, miaoRoot, zzzRoot }
}

async function item(root, relative, { image = WEBP_FIXTURE, data } = {}) {
  const itemRoot = path.join(root, relative)
  const imagePath = relative.includes(`${path.sep}character${path.sep}`)
    ? path.join(itemRoot, "imgs", "face.webp")
    : path.join(itemRoot, "icon.webp")
  await mkdir(path.dirname(imagePath), { recursive: true })
  await writeFile(imagePath, image)
  if (data !== undefined) await writeFile(path.join(itemRoot, "data.json"), JSON.stringify(data))
  return imagePath
}

test("resolves Genshin character by item id before its record name", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  await item(
    context.miaoRoot,
    path.join("resources", "meta-gs", "character", "胡桃"),
    { data: { id: 10000046, name: "胡桃" } },
  )
  const resolver = new RecordAssetResolver({
    pluginRoot: context.pluginRoot,
    fallbackAsset: FALLBACK,
  })

  assert.deepEqual(await resolver.resolve("genshin", {
    itemId: "10000046",
    name: "错误名称",
    itemType: "角色",
  }), {
    url: WEBP_URL,
    source: "miao-plugin",
    kind: "character",
    matchedBy: "item-id",
  })
})

test("refreshes a cached image when its canonical file size or mtime changes", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const imagePath = await item(
    context.miaoRoot,
    path.join("resources", "meta-gs", "character", "胡桃"),
    { data: { id: 10000046, name: "胡桃" } },
  )
  const resolver = new RecordAssetResolver({ pluginRoot: context.pluginRoot, fallbackAsset: FALLBACK })
  const record = { itemId: "10000046", name: "胡桃", itemType: "角色" }

  assert.equal((await resolver.resolve("genshin", record)).url, WEBP_URL)
  await writeFile(imagePath, PNG_FIXTURE)
  assert.equal((await resolver.resolve("genshin", record)).url, PNG_URL)
})

test("uses exact directory names for Genshin weapons and Star Rail characters", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  await item(
    context.miaoRoot,
    path.join("resources", "meta-gs", "weapon", "polearm", "护摩之杖"),
  )
  await item(
    context.miaoRoot,
    path.join("resources", "meta-sr", "character", "流萤"),
    { data: { id: 1310 } },
  )
  const resolver = new RecordAssetResolver({ pluginRoot: context.pluginRoot, fallbackAsset: FALLBACK })

  const genshin = await resolver.resolve("genshin", { name: "护摩之杖", itemType: "武器" })
  const starRail = await resolver.resolve("starrail", { name: "流萤", itemType: "角色" })
  assert.equal(genshin.url, WEBP_URL)
  assert.equal(genshin.matchedBy, "exact-name")
  assert.equal(genshin.kind, "weapon")
  assert.equal(starRail.url, WEBP_URL)
  assert.equal(starRail.matchedBy, "exact-name")
  assert.equal(starRail.kind, "character")
})

test("supports an explicit miao root and Star Rail light-cone ids", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const customRoot = path.join(context.root, "custom-miao")
  await item(
    customRoot,
    path.join("resources", "meta-sr", "weapon", "毁灭", "梦应归于何处"),
    { data: { id: "23025", name: "梦应归于何处" } },
  )
  const resolver = new RecordAssetResolver({
    pluginRoot: context.pluginRoot,
    miaoRoot: customRoot,
    fallbackAsset: FALLBACK,
  })

  const asset = await resolver.resolve("starrail", {
    itemId: "23025",
    itemType: "光锥",
  })
  assert.equal(asset.url, WEBP_URL)
  assert.equal(asset.source, "miao-plugin")
  assert.equal(asset.kind, "weapon")
  assert.equal(asset.matchedBy, "item-id")
})

test("reads the aggregate metadata indexes used by current miao-plugin", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const characterRoot = path.join(context.miaoRoot, "resources", "meta-gs", "character")
  await item(context.miaoRoot, path.join("resources", "meta-gs", "character", "芙宁娜"))
  await writeFile(
    path.join(characterRoot, "data.json"),
    JSON.stringify({ "10000089": { id: 10000089, name: "芙宁娜" } }),
  )

  const weaponRoot = path.join(context.miaoRoot, "resources", "meta-sr", "weapon")
  await item(context.miaoRoot, path.join("resources", "meta-sr", "weapon", "毁灭", "梦应归于何处"))
  await writeFile(
    path.join(weaponRoot, "data.json"),
    JSON.stringify({ "23025": { id: "23025", name: "梦应归于何处", type: "毁灭" } }),
  )

  const resolver = new RecordAssetResolver({
    pluginRoot: context.pluginRoot,
    fallbackAsset: FALLBACK,
  })
  const character = await resolver.resolve("genshin", {
    itemId: "10000089",
    name: "Furina",
    itemType: "角色",
  })
  const lightCone = await resolver.resolve("starrail", {
    itemId: "23025",
    name: "Whereabouts Should Dreams Rest",
    itemType: "光锥",
  })

  assert.equal(character.url, WEBP_URL)
  assert.equal(character.matchedBy, "item-id")
  assert.equal(lightCone.url, WEBP_URL)
  assert.equal(lightCone.matchedBy, "item-id")
})

test("falls back lazily to safe directory names when a miao aggregate path is stale", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const characterRoot = path.join(context.miaoRoot, "resources", "meta-gs", "character")
  await item(context.miaoRoot, path.join("resources", "meta-gs", "character", "胡桃"))
  await writeFile(
    path.join(characterRoot, "data.json"),
    JSON.stringify({ "10000046": { id: 10000046, name: "已迁移的旧目录" } }),
  )

  const resolver = new RecordAssetResolver({
    pluginRoot: context.pluginRoot,
    fallbackAsset: FALLBACK,
  })
  const asset = await resolver.resolve("genshin", {
    itemId: "10000046",
    name: "胡桃",
    itemType: "角色",
  })

  assert.equal(asset.url, WEBP_URL)
  assert.equal(asset.source, "miao-plugin")
  assert.equal(asset.matchedBy, "exact-name")
})

test("recovers an item-id-only miao match when its aggregate category is stale", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const weaponRoot = path.join(context.miaoRoot, "resources", "meta-gs", "weapon")
  await item(context.miaoRoot, path.join("resources", "meta-gs", "weapon", "polearm", "护摩之杖"))
  await writeFile(
    path.join(weaponRoot, "data.json"),
    JSON.stringify({ "13501": { id: 13501, name: "护摩之杖", type: "旧分类" } }),
  )

  const resolver = new RecordAssetResolver({
    pluginRoot: context.pluginRoot,
    fallbackAsset: FALLBACK,
  })
  const asset = await resolver.resolve("genshin", {
    itemId: "13501",
    itemType: "武器",
  })

  assert.equal(asset.url, WEBP_URL)
  assert.equal(asset.source, "miao-plugin")
  assert.equal(asset.kind, "weapon")
  assert.equal(asset.matchedBy, "item-id")
})

test("resolves ZZZ agents, W-Engines, and Bangboo from a sibling ZZZ-Plugin cache", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const mapRoot = path.join(context.zzzRoot, "resources", "map")
  await mkdir(mapRoot, { recursive: true })
  await writeFile(
    path.join(mapRoot, "PartnerId2Data.json"),
    JSON.stringify({ "1241": { id: "1241", name: "艾莲", en_name: "Ellen", sprite_id: "2011" } }),
  )
  await writeFile(
    path.join(mapRoot, "WeaponId2Data.json"),
    JSON.stringify({
      "14104": { Id: 14104, Name: "深海访客", EN: "Deep Sea Visitor", CodeName: "StarlightEngine" },
    }),
  )
  await writeFile(
    path.join(mapRoot, "BangbooId2Data.json"),
    JSON.stringify({ "50013": { Id: 50013, CHS: "鲨牙布", EN: "Sharkboo", sprite_id: 5013 } }),
  )
  const images = [
    path.join(context.zzzRoot, "resources", "images", "square_avatar", "role_square_avatar_1241.png"),
    path.join(context.zzzRoot, "resources", "images", "weapon", "StarlightEngine_High.png"),
    path.join(
      context.zzzRoot,
      "resources",
      "images",
      "bangboo_square_avatar",
      "bangboo_rectangle_avatar_50013.png",
    ),
  ]
  for (const image of images) {
    await mkdir(path.dirname(image), { recursive: true })
    await writeFile(image, WEBP_FIXTURE)
  }

  const resolver = new RecordAssetResolver({ pluginRoot: context.pluginRoot, fallbackAsset: FALLBACK })
  const agent = await resolver.resolve("zzz", { itemId: "1241", name: "错误名称", itemType: "代理人" })
  const weapon = await resolver.resolve("zzz", { itemId: "14104", name: "错误名称", itemType: "音擎" })
  const bangboo = await resolver.resolve("zzz", { name: "鲨牙布", itemType: "邦布" })

  assert.deepEqual(
    [agent, weapon, bangboo].map(asset => [asset.url, asset.source, asset.kind, asset.matchedBy]),
    [
      [WEBP_URL, "ZZZ-Plugin", "character", "item-id"],
      [WEBP_URL, "ZZZ-Plugin", "weapon", "item-id"],
      [WEBP_URL, "ZZZ-Plugin", "bangboo", "exact-name"],
    ],
  )

  for (const [name, itemType, expectedKind] of [
    ["Ellen", "Agent", "character"],
    ["Deep Sea Visitor", "W-Engine", "weapon"],
    ["Sharkboo", "Bangboo", "bangboo"],
  ]) {
    const localized = await resolver.resolve("zzz", { name, itemType })
    assert.equal(localized.url, WEBP_URL)
    assert.equal(localized.source, "ZZZ-Plugin")
    assert.equal(localized.kind, expectedKind)
    assert.equal(localized.matchedBy, "exact-name")
  }
})

test("uses safe direct ZZZ agent and Bangboo ids even when optional map files are absent", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const agentImage = path.join(
    context.zzzRoot,
    "resources",
    "images",
    "square_avatar",
    "role_square_avatar_1091.png",
  )
  const bangbooImage = path.join(
    context.zzzRoot,
    "resources",
    "images",
    "bangboo_square_avatar",
    "bangboo_rectangle_avatar_50013.png",
  )
  for (const image of [agentImage, bangbooImage]) {
    await mkdir(path.dirname(image), { recursive: true })
    await writeFile(image, WEBP_FIXTURE)
  }

  const resolver = new RecordAssetResolver({
    pluginRoot: context.pluginRoot,
    zzzRoot: context.zzzRoot,
    fallbackAsset: FALLBACK,
  })
  assert.equal((await resolver.resolve("zzz", { itemId: "1091", itemType: "代理人" })).source, "ZZZ-Plugin")
  assert.equal((await resolver.resolve("zzz", { itemId: "50013", itemType: "邦布" })).source, "ZZZ-Plugin")
})

test("missing miao-plugin, unsupported games, and unsafe names use the supplied fallback", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const resolver = new RecordAssetResolver({ pluginRoot: context.pluginRoot, fallbackAsset: FALLBACK })

  for (const [game, record] of [
    ["genshin", { name: "../胡桃", itemType: "角色" }],
    ["starrail", { name: "..\\流萤", itemType: "角色" }],
    ["zzz", { name: "艾莲", itemType: "代理人" }],
  ]) {
    assert.deepEqual(await resolver.resolve(game, record), {
      url: FALLBACK,
      source: "builtin",
      kind: "character",
      matchedBy: "fallback",
    })
  }
})

test("does not follow a symlinked item directory outside miao-plugin", async t => {
  const context = await fixture()
  t.after(() => rm(context.root, { recursive: true, force: true }))
  const characterRoot = path.join(context.miaoRoot, "resources", "meta-gs", "character")
  const outside = path.join(context.root, "outside", "恶意角色")
  await mkdir(path.join(outside, "imgs"), { recursive: true })
  await writeFile(path.join(outside, "imgs", "face.webp"), "outside")
  await writeFile(path.join(outside, "data.json"), JSON.stringify({ id: 999999, name: "恶意角色" }))
  await mkdir(characterRoot, { recursive: true })
  try {
    await symlink(outside, path.join(characterRoot, "恶意角色"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`symlinks unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const resolver = new RecordAssetResolver({ pluginRoot: context.pluginRoot, fallbackAsset: FALLBACK })
  assert.deepEqual(await resolver.resolve("genshin", {
    itemId: "999999",
    name: "恶意角色",
    itemType: "角色",
  }), {
    url: FALLBACK,
    source: "builtin",
    kind: "character",
    matchedBy: "fallback",
  })
})
