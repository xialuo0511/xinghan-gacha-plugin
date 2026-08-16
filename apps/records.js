import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

import plugin from "../../../lib/plugins/plugin.js"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"

import { recordBatchCursorStore } from "../src/adapters/yunzai/recordBatchCursorStore.js"
import { privateOnly, publicErrorMessage } from "../src/adapters/yunzai/messages.js"
import { checkedRecordReply } from "../src/adapters/yunzai/recordReply.js"
import { renderRecordImage } from "../src/adapters/yunzai/recordRenderer.js"
import { enqueueRecordRender } from "../src/adapters/yunzai/recordRenderGate.js"
import {
  loadRecordViewWithTimeout,
  RECORD_VIEW_LOAD_TIMEOUT_MS,
} from "../src/adapters/yunzai/recordViewLoader.js"
import { getYunzaiRuntime } from "../src/adapters/yunzai/runtime.js"
import { createRecordViewPaginator } from "../src/view/recordViewPagination.js"
import { ProtocolError } from "../src/protocol/http.js"
import { PLUGIN_REVISION } from "../src/version.js"

const RECORD_BATCH_PAGE_LIMIT = 8
const RECORD_PAGE_SEND_INTERVAL_MS = 750

const GAMES = Object.freeze({
  genshin: "原神",
  starrail: "星铁",
  zzz: "绝区零",
})

const NEXT_BATCH_COMMANDS = Object.freeze({
  genshin: "#原神抽卡记录下一批",
  starrail: "#星铁抽卡记录下一批",
  zzz: "#绝区零抽卡记录下一批",
})

function viewSignature(view) {
  const hash = createHash("sha256")
  hash.update(`${view.game}\0${view.uid}\0${String(view.latestRecordAt ?? "")}\0`, "utf8")
  for (const pool of view.pools) {
    hash.update(`${pool.queryType}\0${pool.total}\0${pool.highCount}\0`, "utf8")
    for (const item of pool.items) hash.update(`${item.id}\0`, "utf8")
  }
  return hash.digest("hex")
}

function safeReply(reply, message) {
  return checkedRecordReply(reply, message).catch(() => false)
}

function recordLog(level, message) {
  const output = globalThis.logger?.[level] ?? globalThis.logger?.info
  if (typeof output === "function") {
    output.call(globalThis.logger, `[xinghan-gacha-plugin/records] ${message}`)
  }
}

export class records extends plugin {
  constructor() {
    super({
      name: "三游戏抽卡记录图",
      dsc: "查看原神、星铁和绝区零抽卡记录图片",
      event: "message",
      priority: 1000,
      rule: [
        {
          reg: "^#(?:抽卡记录|原神抽卡记录|抽卡记录-查看原神抽卡记录|查看原神抽卡记录)$",
          fnc: "viewGenshin",
          log: false,
        },
        {
          reg: "^#(?:抽卡记录|原神抽卡记录)下一批$",
          fnc: "nextGenshin",
          log: false,
        },
        {
          reg: "^(?:\\*(?:抽卡记录|星铁抽卡记录|抽卡记录-查看(?:HSR|hsr|星铁)(?:的)?(?:抽卡记录)?)|#(?:抽卡记录-查看星铁抽卡记录|查看星铁抽卡记录))$",
          fnc: "viewStarRail",
          log: false,
        },
        {
          reg: "^(?:\\*|#)(?:抽卡记录|星铁抽卡记录|HSR抽卡记录|hsr抽卡记录)下一批$",
          fnc: "nextStarRail",
          log: false,
        },
        {
          reg: "^(?:[%％](?:抽卡记录|绝区零抽卡记录|抽卡记录-查看(?:ZZZ|zzz|绝区零)(?:的)?(?:抽卡记录)?)|#(?:抽卡记录-查看绝区零抽卡记录|查看绝区零抽卡记录))$",
          fnc: "viewZzz",
          log: false,
        },
        {
          reg: "^(?:[%％]|#)(?:抽卡记录|绝区零抽卡记录|ZZZ抽卡记录|zzz抽卡记录)下一批$",
          fnc: "nextZzz",
          log: false,
        },
      ],
    })
  }

  async viewGame(game, { continueBatch = false } = {}) {
    const event = this.e
    const userId = String(event?.user_id ?? "")
    const adapter = String(event?.adapter_name ?? event?.adapter_id ?? "unknown")
    const selfId = String(event?.self_id ?? this.self_id ?? "unknown")
    const eventReply = event?.reply
    const reply = (...args) => {
      if (typeof eventReply !== "function") return false
      return eventReply.call(event, ...args)
    }
    recordLog(
      "info",
      `命令已命中 revision=${PLUGIN_REVISION} game=${game} adapter=${adapter} private=${Boolean(event?.isPrivate)}`,
    )
    if (!privateOnly(this)) return true
    let totalPages = 0
    let currentPage = 1
    let lastSentPage = 0
    const renderKey = `${adapter}:${selfId}:${userId}:${game}`
    const loadRuntime = this.getRecordRuntime.bind(this)
    const viewLoadTimeoutMs = this.recordViewLoadTimeoutMilliseconds()
    const renderPage = this.renderRecordPage.bind(this)
    const waitPageInterval = this.waitRecordPageInterval.bind(this)
    const savedBatch = continueBatch ? recordBatchCursorStore.get(renderKey) : undefined
    if (continueBatch && !savedBatch) {
      await safeReply(reply, `没有待继续发送的${GAMES[game]}抽卡记录，请先重新查看记录。`)
      return true
    }
    if (!continueBatch) recordBatchCursorStore.delete(renderKey)

    let job
    try {
      job = enqueueRecordRender(renderKey, async () => {
        const runtime = loadRuntime()
        // Loading is the last side-effect-free phase. If it times out, this task
        // exits before constructing a paginator, taking a screenshot or sending a result page.
        const view = await loadRecordViewWithTimeout(runtime.recordViewService, userId, game, {
          timeoutMs: viewLoadTimeoutMs,
        })
        const signature = viewSignature(view)
        if (savedBatch && savedBatch.signature !== signature) {
          recordBatchCursorStore.delete(renderKey)
          throw new ProtocolError("RECORD_VIEW_CHANGED", "Record data changed between batches")
        }

        const paginator = createRecordViewPaginator(view, {
          cursor: savedBatch?.cursor,
        })
        totalPages = paginator.totalPages
        const firstPage = paginator.cursor().pageIndex + 1
        currentPage = firstPage
        const finalPage = Math.min(totalPages, firstPage + RECORD_BATCH_PAGE_LIMIT - 1)
        if (totalPages > 1) {
          await checkedRecordReply(
            reply,
            `${continueBatch ? "继续发送" : `共 ${totalPages} 页，本批发送`}第 ${firstPage}-${finalPage} 页。`,
          )
        }

        let skipAssetResolution = savedBatch?.skipAssetResolution ?? false
        for (let index = 0; index < RECORD_BATCH_PAGE_LIMIT && paginator.hasNext(); index += 1) {
          const resumeCursor = paginator.cursor()
          const page = paginator.next()
          currentPage = page.pagination.page
          try {
            const image = await renderPage(page, {
              skipAssetResolution,
              onAssetTimeout: () => {
                skipAssetResolution = true
              },
            })
            await checkedRecordReply(reply, image)
            lastSentPage = currentPage
          } catch (error) {
            recordBatchCursorStore.set(renderKey, {
              signature,
              cursor: resumeCursor,
              skipAssetResolution,
            })
            throw error
          }
          if (paginator.hasNext() && index + 1 < RECORD_BATCH_PAGE_LIMIT) {
            await waitPageInterval(RECORD_PAGE_SEND_INTERVAL_MS)
          }
        }

        if (paginator.hasNext()) {
          recordBatchCursorStore.set(renderKey, {
            signature,
            cursor: paginator.cursor(),
            skipAssetResolution,
          })
          await checkedRecordReply(
            reply,
            `本批已发送至第 ${paginator.cursor().pageIndex}/${totalPages} 页；发送 ${NEXT_BATCH_COMMANDS[game]} 继续。`,
          )
        } else {
          recordBatchCursorStore.delete(renderKey)
        }
      })
    } catch (error) {
      await safeReply(reply, publicErrorMessage(error))
      return true
    }

    if (job.duplicate) {
      await safeReply(reply, `${GAMES[game]}抽卡记录图正在生成，请勿重复发送命令。`)
      return true
    }

    void job.completion.catch(() => {})
    await safeReply(
      reply,
      job.queued
        ? `${GAMES[game]}抽卡记录图已进入生成队列，请稍候……`
        : `正在生成${GAMES[game]}抽卡记录图，请稍候……`,
    )
    try {
      await job.completion
    } catch (error) {
      recordLog(
        "warn",
        `生成失败 game=${game} page=${currentPage}/${totalPages || "?"} ` +
          `code=${String(error?.code ?? "UNKNOWN_ERROR")} cause=${String(error?.causeName ?? error?.name ?? "Error")}`,
      )
      const progress = lastSentPage > 0 ? `已发送至第 ${lastSentPage}/${totalPages} 页；` : ""
      const retry = recordBatchCursorStore.get(renderKey)
        ? `可发送 ${NEXT_BATCH_COMMANDS[game]} 重试。`
        : ""
      await safeReply(reply, `${progress}${publicErrorMessage(error)}${retry}`)
    }
    return true
  }

  viewGenshin() {
    return this.viewGame("genshin")
  }

  viewStarRail() {
    return this.viewGame("starrail")
  }

  viewZzz() {
    return this.viewGame("zzz")
  }

  nextGenshin() {
    return this.viewGame("genshin", { continueBatch: true })
  }

  nextStarRail() {
    return this.viewGame("starrail", { continueBatch: true })
  }

  nextZzz() {
    return this.viewGame("zzz", { continueBatch: true })
  }

  getRecordRuntime() {
    return getYunzaiRuntime()
  }

  recordViewLoadTimeoutMilliseconds() {
    return RECORD_VIEW_LOAD_TIMEOUT_MS
  }

  renderRecordPage(page, options) {
    return renderRecordImage(puppeteer, page, options)
  }

  waitRecordPageInterval(milliseconds) {
    return delay(milliseconds)
  }
}
