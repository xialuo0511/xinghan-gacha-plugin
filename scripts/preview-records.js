import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { recordRenderData } from "../src/adapters/yunzai/recordRenderer.js"
import { RecordViewService } from "../src/view/recordViewService.js"

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const output = path.join(root, "temp", "record-previews")

const fixtures = Object.freeze({
  genshin: Object.freeze({
    role: { game: "genshin", gameBiz: "hk4e_cn", uid: "123456789", region: "cn_gf01", regionName: "天空岛" },
    high: "5",
    middle: "4",
    low: "3",
    limited: "301",
    secondary: "302",
    up: "胡桃",
    off: "迪卢克",
    itemType: "角色",
  }),
  starrail: Object.freeze({
    role: { game: "starrail", gameBiz: "hkrpg_cn", uid: "100000001", region: "prod_gf_cn", regionName: "星穹列车" },
    high: "5",
    middle: "4",
    low: "3",
    limited: "11",
    secondary: "12",
    up: "流萤",
    off: "布洛妮娅",
    itemType: "角色",
  }),
  zzz: Object.freeze({
    role: { game: "zzz", gameBiz: "nap_cn", uid: "10000002", region: "prod_gf_cn", regionName: "新艾利都" },
    high: "4",
    middle: "3",
    low: "2",
    limited: "2",
    secondary: "3",
    up: "艾莲",
    off: "莱卡恩",
    itemType: "代理人",
  }),
})

function records(config) {
  return Array.from({ length: 36 }, (_, offset) => {
    const id = offset + 1
    const high = [9, 21, 33].includes(id)
    const middle = !high && id % 4 === 0
    const limited = id % 6 !== 0
    return {
      game: config.role.game,
      gameBiz: config.role.gameBiz,
      uid: config.role.uid,
      id: String(id),
      gachaType: limited ? config.limited : config.secondary,
      name: high ? (id === 21 ? config.off : config.up) : middle ? `四星样例 ${id}` : `普通样例 ${id}`,
      itemType: high ? config.itemType : middle ? config.itemType : "武器",
      rankType: high ? config.high : middle ? config.middle : config.low,
      time: `2026-08-${String(Math.ceil(id / 3)).padStart(2, "0")} ${String(id % 24).padStart(2, "0")}:00:00`,
    }
  }).reverse()
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
    now: () => new Date("2026-08-02T12:00:00.000Z"),
  })
  const view = await service.get("preview-user", game)
  const data = recordRenderData(view, { pluginRoot: root })
  const source = await readFile(data.tplFile, "utf8")
  const html = source
    .replace("{{cssUrl}}", data.cssUrl)
    .replace("{{@ viewJson}}", data.viewJson)
    .replace("{{scriptUrl}}", data.scriptUrl)
  const target = path.join(output, `${game}.html`)
  await writeFile(target, html, "utf8")
  console.log(target)
}
