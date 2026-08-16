import { readFile, readdir, stat } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"

const host = "127.0.0.1"
const defaultPort = 4173
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)))
const previewRoot = path.join(root, "temp", "record-previews")
const recordResourceRoot = path.join(root, "resources", "records")
const assetRoot = path.join(recordResourceRoot, "assets")
const assetRoutePrefix = "/resources/records/assets/"

const exactRoutes = new Map([
  ["/resources/records/base.css", path.join(recordResourceRoot, "base.css")],
  ["/resources/records/base.js", path.join(recordResourceRoot, "base.js")],
])

const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
])
const assetExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".woff2"])

function configuredPort(argumentsList = process.argv.slice(2), environment = process.env) {
  const optionIndex = argumentsList.indexOf("--port")
  const raw = optionIndex >= 0 ? argumentsList[optionIndex + 1] : environment.RECORD_PREVIEW_PORT
  if (optionIndex >= 0 && raw === undefined) throw new Error("--port requires a value")
  if (raw === undefined || raw === "") return defaultPort

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(`Invalid preview port: ${raw}`)
  }
  return value
}

function decodedPath(requestUrl) {
  const rawPath = requestUrl.split("?", 1)[0]
  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return undefined
  }

  if (decoded.includes("\0") || decoded.includes("\\")) return undefined
  const segments = decoded.split("/")
  if (segments.some((segment) => segment === "." || segment === "..")) return undefined
  return decoded
}

function containedFile(base, relativePath) {
  const resolvedBase = path.resolve(base)
  const candidate = path.resolve(resolvedBase, relativePath)
  if (!candidate.startsWith(`${resolvedBase}${path.sep}`)) return undefined
  return candidate
}

async function previewNames() {
  try {
    const entries = await readdir(previewRoot, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if (error?.code === "ENOENT") return []
    throw error
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

async function indexPage() {
  const names = await previewNames()
  const links = names.length
    ? names.map((name) => `<li><a href="/${encodeURIComponent(name)}">${escapeHtml(name)}</a></li>`).join("")
    : "<li>No previews found. Run <code>pnpm preview:records</code> first.</li>"

  return Buffer.from(
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>抽卡记录预览</title>` +
      `<body><h1>抽卡记录预览</h1><ul>${links}</ul></body></html>`,
    "utf8",
  )
}

async function routeFile(pathname) {
  const exact = exactRoutes.get(pathname)
  if (exact) return exact

  if (/^\/[A-Za-z0-9_-]+\.html$/.test(pathname)) {
    const name = pathname.slice(1)
    if (!(await previewNames()).includes(name)) return undefined
    return containedFile(previewRoot, name)
  }

  if (!pathname.startsWith(assetRoutePrefix)) return undefined
  const relative = pathname.slice(assetRoutePrefix.length)
  if (!relative || path.extname(relative) === "") return undefined
  if (!assetExtensions.has(path.extname(relative).toLowerCase())) return undefined
  return containedFile(assetRoot, relative.split("/").join(path.sep))
}

function writeResponse(response, statusCode, body, contentType = "text/plain; charset=utf-8", headOnly = false) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": body.byteLength,
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  })
  response.end(headOnly ? undefined : body)
}

const server = http.createServer(async (request, response) => {
  const headOnly = request.method === "HEAD"
  if (request.method !== "GET" && !headOnly) {
    response.setHeader("Allow", "GET, HEAD")
    writeResponse(response, 405, Buffer.from("Method Not Allowed"), undefined, headOnly)
    return
  }

  const pathname = decodedPath(request.url ?? "/")
  if (pathname === undefined) {
    writeResponse(response, 400, Buffer.from("Bad Request"), undefined, headOnly)
    return
  }

  try {
    if (pathname === "/") {
      writeResponse(response, 200, await indexPage(), "text/html; charset=utf-8", headOnly)
      return
    }

    const file = await routeFile(pathname)
    if (!file) {
      writeResponse(response, 404, Buffer.from("Not Found"), undefined, headOnly)
      return
    }

    const info = await stat(file)
    if (!info.isFile()) {
      writeResponse(response, 404, Buffer.from("Not Found"), undefined, headOnly)
      return
    }

    const body = await readFile(file)
    const contentType = contentTypes.get(path.extname(file).toLowerCase()) ?? "application/octet-stream"
    writeResponse(response, 200, body, contentType, headOnly)
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      writeResponse(response, 404, Buffer.from("Not Found"), undefined, headOnly)
      return
    }
    console.error(error)
    writeResponse(response, 500, Buffer.from("Internal Server Error"), undefined, headOnly)
  }
})

const port = configuredPort()
server.listen(port, host, () => {
  const address = server.address()
  const listeningPort = typeof address === "object" && address ? address.port : port
  console.log(`Record previews: http://${host}:${listeningPort}/`)
  console.log("Press Ctrl+C to stop.")
})

function shutdown(signal) {
  console.log(`\n${signal} received; stopping preview server.`)
  server.close((error) => {
    if (error) {
      console.error(error)
      process.exitCode = 1
    }
  })
}

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))
