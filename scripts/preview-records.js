import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  recordRenderData,
  resolveRecordViewAssets,
} from "../src/adapters/yunzai/recordRenderer.js"
import { RecordViewService } from "../src/view/recordViewService.js"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const output = path.join(root, "temp", "record-previews")
const fallbackUrl = "/resources/records/assets/item-fallback.webp"

const fixtures = Object.freeze({
  genshin: Object.freeze({
    role: {
      game: "genshin",
      gameBiz: "hk4e_cn",
      uid: "123456789",
      region: "cn_gf01",
      regionName: "天空岛",
    },
    highRank: "5",
    lowRank: "3",
    pools: [
      {
        queryType: "301",
        tail: 17,
        events: [
          { pulls: 18, name: "胡桃", itemId: "10000046", itemType: "角色", isUp: true },
          { pulls: 74, name: "迪卢克", itemId: "10000016", itemType: "角色", isUp: false },
          { pulls: 44, name: "芙宁娜", itemId: "10000089", itemType: "角色", isUp: true },
        ],
      },
      {
        queryType: "302",
        tail: 9,
        events: [
          { pulls: 38, name: "护摩之杖", itemId: "13501", itemType: "武器" },
          { pulls: 66, name: "雾切之回光", itemId: "11509", itemType: "武器" },
        ],
      },
      {
        queryType: "200",
        tail: 28,
        events: [{ pulls: 82, name: "七七", itemId: "10000035", itemType: "角色" }],
      },
    ],
  }),
  starrail: Object.freeze({
    role: {
      game: "starrail",
      gameBiz: "hkrpg_cn",
      uid: "100000001",
      region: "prod_gf_cn",
      regionName: "星穹列车",
    },
    highRank: "5",
    lowRank: "3",
    pools: [
      {
        queryType: "11",
        tail: 14,
        events: [
          { pulls: 27, name: "流萤", itemId: "1310", itemType: "角色", isUp: true },
          { pulls: 79, name: "布洛妮娅", itemId: "1101", itemType: "角色", isUp: false },
        ],
      },
      {
        queryType: "21",
        tail: 7,
        events: [
          { pulls: 42, name: "黄泉", itemId: "1308", itemType: "角色", isUp: true },
          { pulls: 68, name: "姬子", itemId: "1003", itemType: "角色", isUp: false },
        ],
      },
      {
        queryType: "12",
        tail: 21,
        events: [
          { pulls: 36, name: "梦应归于何处", itemId: "23025", itemType: "光锥" },
          { pulls: 71, name: "只需等待", itemId: "23006", itemType: "光锥" },
        ],
      },
      {
        queryType: "22",
        tail: 4,
        events: [
          { pulls: 48, name: "只需等待", itemId: "23006", itemType: "光锥" },
          { pulls: 76, name: "梦应归于何处", itemId: "23025", itemType: "光锥" },
        ],
      },
      {
        queryType: "1",
        tail: 6,
        events: [
          { pulls: 61, name: "布洛妮娅", itemId: "1101", itemType: "角色" },
          { pulls: 88, name: "姬子", itemId: "1003", itemType: "角色" },
        ],
      },
      {
        queryType: "2",
        tail: 0,
        events: [
          { pulls: 19, name: "流萤", itemId: "1310", itemType: "角色" },
          { pulls: 26, name: "姬子", itemId: "1003", itemType: "角色" },
        ],
      },
    ],
  }),
  zzz: Object.freeze({
    role: {
      game: "zzz",
      gameBiz: "nap_cn",
      uid: "10000002",
      region: "prod_gf_cn",
      regionName: "新艾利都",
    },
    highRank: "4",
    lowRank: "2",
    pools: [
      {
        queryType: "2",
        tail: 12,
        events: [
          { pulls: 24, name: "艾莲", itemId: "1241", itemType: "代理人", isUp: true },
          { pulls: 78, name: "莱卡恩", itemId: "1141", itemType: "代理人", isUp: false },
          { pulls: 47, name: "星见雅", itemId: "1091", itemType: "代理人", isUp: true },
        ],
      },
      {
        queryType: "3",
        tail: 19,
        events: [
          { pulls: 31, name: "深海访客", itemId: "14104", itemType: "音擎" },
          { pulls: 69, name: "嵌合编译器", itemId: "14102", itemType: "音擎" },
        ],
      },
      {
        queryType: "5",
        tail: 8,
        events: [{ pulls: 62, name: "鲨牙布", itemId: "50013", itemType: "邦布" }],
      },
    ],
  }),
})

function recordTime(id) {
  const date = new Date(Date.UTC(2026, 6, 1, 8, 0) + id * 31 * 60 * 1000)
  return date.toISOString().replace("T", " ").slice(0, 19)
}

function records(config) {
  const result = []
  let id = 0
  for (const pool of config.pools) {
    for (const event of pool.events) {
      for (let pull = 1; pull < event.pulls; pull += 1) {
        id += 1
        result.push({
          game: config.role.game,
          gameBiz: config.role.gameBiz,
          uid: config.role.uid,
          id: String(id),
          gachaType: pool.queryType,
          name: `普通记录 ${id}`,
          itemType: "普通物品",
          rankType: config.lowRank,
          time: recordTime(id),
        })
      }
      id += 1
      result.push({
        game: config.role.game,
        gameBiz: config.role.gameBiz,
        uid: config.role.uid,
        id: String(id),
        gachaType: pool.queryType,
        rankType: config.highRank,
        time: recordTime(id),
        ...event,
      })
    }
    for (let pull = 0; pull < pool.tail; pull += 1) {
      id += 1
      result.push({
        game: config.role.game,
        gameBiz: config.role.gameBiz,
        uid: config.role.uid,
        id: String(id),
        gachaType: pool.queryType,
        name: `普通记录 ${id}`,
        itemType: "普通物品",
        rankType: config.lowRank,
        time: recordTime(id),
      })
    }
  }
  return result.reverse()
}

await mkdir(output, { recursive: true })
for (const [game, config] of Object.entries(fixtures)) {
  const credential = { roles: [config.role], selectedRoles: { [game]: config.role.uid } }
  const service = new RecordViewService({
    credentialStore: { load: async () => credential },
    recordStore: {
      listRoles: async () => [config.role],
      load: async () => records(config),
    },
    now: () => new Date("2026-08-15T12:00:00.000Z"),
  })
  const view = await resolveRecordViewAssets(await service.get("preview-user", game), {
    pluginRoot: root,
  })
  const data = recordRenderData(view, { pluginRoot: root, fallbackUrl })
  const source = await readFile(data.tplFile, "utf8")
  const html = source
    .replace("{{cssUrl}}", "/resources/records/base.css")
    .replace("{{@ viewJson}}", data.viewJson)
    .replace("{{scriptUrl}}", "/resources/records/base.js")
  const target = path.join(output, `${game}.html`)
  await writeFile(target, html, "utf8")
  console.log(target)
}
