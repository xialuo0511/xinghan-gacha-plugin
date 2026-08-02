import { createHash } from "node:crypto"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { ProtocolError } from "../../protocol/http.js"

const TEMPLATE_FILES = Object.freeze({
  genshin: "genshin.html",
  starrail: "starrail.html",
  zzz: "zzz.html",
})

function serializedView(view) {
  return JSON.stringify(view)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029")
}

export function recordRenderData(view, { pluginRoot } = {}) {
  const root = pluginRoot ?? path.join(process.cwd(), "plugins", "xinghan-gacha-plugin")
  const resourceRoot = path.join(root, "resources", "records")
  const template = TEMPLATE_FILES[view?.game]
  if (!template) throw new RangeError("Unsupported record view game")
  const saveId = createHash("sha256")
    .update(`${view.game}:${view.uid}`, "utf8")
    .digest("hex")
    .slice(0, 20)
  return Object.freeze({
    tplFile: path.join(resourceRoot, template),
    saveId,
    imgType: "jpeg",
    quality: 90,
    viewJson: serializedView(view),
    cssUrl: pathToFileURL(path.join(resourceRoot, "base.css")).href,
    scriptUrl: pathToFileURL(path.join(resourceRoot, "base.js")).href,
    pageGotoParams: Object.freeze({ timeout: 30_000, waitUntil: "load" }),
  })
}

export async function renderRecordImage(renderer, view, options) {
  if (typeof renderer?.screenshot !== "function") {
    throw new ProtocolError("RENDER_UNAVAILABLE", "TRSS screenshot renderer is unavailable")
  }
  const image = await renderer.screenshot("xinghan-gacha-records", recordRenderData(view, options))
  if (!image) throw new ProtocolError("RENDER_UNAVAILABLE", "Record screenshot failed")
  return image
}
