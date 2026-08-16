export const RECORD_BATCH_CURSOR_TTL_MS = 15 * 60 * 1_000
export const MAX_RECORD_BATCH_CURSORS = 32

function normalizeKey(key) {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new TypeError("Record batch cursor key must be a non-empty string")
  }
  return key.trim()
}

function cloneCursor(cursor) {
  if (
    !cursor ||
    typeof cursor !== "object" ||
    !Array.isArray(cursor.positions) ||
    !Number.isSafeInteger(cursor.poolCursor) ||
    !Number.isSafeInteger(cursor.pageIndex)
  ) {
    throw new TypeError("Record batch cursor is invalid")
  }
  if (cursor.positions.some(position => !Number.isSafeInteger(position) || position < 0)) {
    throw new RangeError("Record batch cursor contains an invalid position")
  }
  return Object.freeze({
    positions: Object.freeze([...cursor.positions]),
    poolCursor: cursor.poolCursor,
    pageIndex: cursor.pageIndex,
  })
}

export class RecordBatchCursorStore {
  #entries = new Map()

  constructor({
    ttlMs = RECORD_BATCH_CURSOR_TTL_MS,
    maxEntries = MAX_RECORD_BATCH_CURSORS,
    now = Date.now,
  } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new RangeError("Record batch cursor TTL must be a positive safe integer")
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new RangeError("Record batch cursor capacity must be a positive safe integer")
    }
    if (typeof now !== "function") throw new TypeError("Record batch cursor clock is required")
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
    this.now = now
  }

  #prune() {
    const current = this.now()
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt <= current) this.#entries.delete(key)
    }
  }

  get(key) {
    const normalizedKey = normalizeKey(key)
    this.#prune()
    const entry = this.#entries.get(normalizedKey)
    if (!entry) return undefined
    return Object.freeze({
      signature: entry.signature,
      cursor: cloneCursor(entry.cursor),
      skipAssetResolution: entry.skipAssetResolution,
    })
  }

  set(key, { signature, cursor, skipAssetResolution = false }) {
    const normalizedKey = normalizeKey(key)
    if (typeof signature !== "string" || signature.length === 0) {
      throw new TypeError("Record batch signature must be a non-empty string")
    }
    const storedCursor = cloneCursor(cursor)
    this.#prune()
    this.#entries.delete(normalizedKey)
    while (this.#entries.size >= this.maxEntries) {
      this.#entries.delete(this.#entries.keys().next().value)
    }
    this.#entries.set(normalizedKey, {
      signature,
      cursor: storedCursor,
      skipAssetResolution: Boolean(skipAssetResolution),
      expiresAt: this.now() + this.ttlMs,
    })
  }

  delete(key) {
    return this.#entries.delete(normalizeKey(key))
  }
}

export const recordBatchCursorStore = new RecordBatchCursorStore()
