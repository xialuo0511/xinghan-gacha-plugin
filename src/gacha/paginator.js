import { ProtocolError } from "../protocol/http.js"

async function fetchWithRateLimitRetry(
  fetchPage,
  { cursor, page, maxRetries, sleep, backoffBaseMs, random },
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchPage(cursor, page)
    } catch (error) {
      if (error?.code !== "RATE_LIMITED" || attempt >= maxRetries) throw error
      const jitter = Math.floor(random() * 300)
      await sleep(backoffBaseMs * 2 ** attempt + jitter)
    }
  }
}

export async function paginateGachaPool({
  fetchPage,
  normalize,
  hasRecord = async () => false,
  pageSize = 20,
  maxPages = 100,
  maxRateLimitRetries = 3,
  backoffBaseMs = 1_000,
  pageDelayMs = 300,
  pageJitterMs = 150,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  random = Math.random,
}) {
  const records = []
  const seen = new Set()
  let cursor = "0"
  let pages = 0
  let stopReason = "max-pages"

  while (pages < maxPages) {
    const page = await fetchWithRateLimitRetry(fetchPage, {
      cursor,
      page: pages + 1,
      maxRetries: maxRateLimitRetries,
      sleep,
      backoffBaseMs,
      random,
    })
    const list = page?.list
    if (!Array.isArray(list)) throw new ProtocolError("INVALID_GACHA_LIST", "Page list is invalid")
    pages += 1
    if (list.length === 0) {
      stopReason = "empty-page"
      break
    }

    let encounteredExisting = false
    for (const item of list) {
      const record = normalize(item)
      const key = `${record.gameBiz}:${record.uid}:${record.id}`
      if (seen.has(key)) continue
      seen.add(key)
      if (await hasRecord(record)) {
        encounteredExisting = true
        break
      }
      records.push(record)
    }
    if (encounteredExisting) {
      stopReason = "existing-record"
      break
    }

    const nextCursorValue = list.at(-1)?.id
    if (nextCursorValue === undefined || nextCursorValue === null || nextCursorValue === "") {
      throw new ProtocolError("MISSING_CURSOR", "Gacha page is missing its final record id")
    }
    const nextCursor = String(nextCursorValue)
    if (nextCursor === cursor) {
      stopReason = "unchanged-cursor"
      break
    }
    cursor = nextCursor
    if (list.length < pageSize) {
      stopReason = "short-page"
      break
    }
    if (pageDelayMs > 0) await sleep(pageDelayMs + Math.floor(random() * (pageJitterMs + 1)))
  }

  return Object.freeze({
    records: Object.freeze(records),
    pages,
    cursor,
    stopReason,
  })
}
