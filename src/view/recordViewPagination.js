export const RECORD_PAGE_ITEM_LIMIT = 24

const POOL_TURN_ITEM_LIMIT = 4

function assertView(view) {
  if (!view || typeof view !== "object" || Array.isArray(view)) {
    throw new TypeError("Record view must be an object")
  }
  if (!Array.isArray(view.pools)) {
    throw new TypeError("Record view pools must be an array")
  }
  for (const [index, pool] of view.pools.entries()) {
    if (!pool || typeof pool !== "object" || !Array.isArray(pool.items)) {
      throw new TypeError(`Record view pool ${index} must contain an items array`)
    }
  }
}

function assertItemLimit(itemLimit) {
  if (!Number.isSafeInteger(itemLimit) || itemLimit <= 0) {
    throw new RangeError("Record page item limit must be a positive safe integer")
  }
}

function assertPageLimit(pageLimit) {
  if (!Number.isSafeInteger(pageLimit) || pageLimit <= 0) {
    throw new RangeError("Record page batch limit must be a positive safe integer")
  }
}

function cloneFrozen(value, seen = new WeakMap()) {
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) {
    const clonedDate = new Date(value.getTime())
    seen.set(value, clonedDate)
    return Object.freeze(clonedDate)
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype)
  seen.set(value, clone)

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable) continue
    clone[key] = cloneFrozen(value[key], seen)
  }
  return Object.freeze(clone)
}

function buildPage(view, poolItems, pagination, { preserveAllPools = false } = {}) {
  const pools = view.pools.flatMap((pool, index) => {
    const items = poolItems.get(index) ?? []
    const keepEmptyPool =
      pagination.page === 1 && Number(pool.total) > 0 && Number(pool.highCount) === 0
    if (!preserveAllPools && items.length === 0 && !keepEmptyPool) return []
    return [{ ...pool, items }]
  })

  return cloneFrozen({
    ...view,
    pools,
    pagination,
  })
}

function restoreCursor(view, totalItems, totalPages, itemLimit, cursor) {
  if (cursor === undefined) {
    return { positions: view.pools.map(() => 0), poolCursor: 0, pageIndex: 0 }
  }
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    throw new TypeError("Record page cursor must be an object")
  }
  if (!Array.isArray(cursor.positions) || cursor.positions.length !== view.pools.length) {
    throw new RangeError("Record page cursor does not match the view pools")
  }
  const positions = cursor.positions.map((position, index) => {
    if (
      !Number.isSafeInteger(position) ||
      position < 0 ||
      position > view.pools[index].items.length
    ) {
      throw new RangeError("Record page cursor contains an invalid pool position")
    }
    return position
  })
  const pageIndex = cursor.pageIndex
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > totalPages) {
    throw new RangeError("Record page cursor contains an invalid page index")
  }
  const poolCursor = cursor.poolCursor
  const poolCount = view.pools.length
  if (
    !Number.isSafeInteger(poolCursor) ||
    poolCursor < 0 ||
    (poolCount === 0 ? poolCursor !== 0 : poolCursor >= poolCount)
  ) {
    throw new RangeError("Record page cursor contains an invalid pool cursor")
  }
  const consumed = positions.reduce((sum, position) => sum + position, 0)
  const expectedConsumed = Math.min(totalItems, pageIndex * itemLimit)
  if (consumed !== expectedConsumed) {
    throw new RangeError("Record page cursor progress is inconsistent")
  }
  return { positions, poolCursor, pageIndex }
}

/**
 * Build one render page at a time without materializing an unbounded history.
 * Each scheduling turn contributes at most four items from one pool so that large
 * pools cannot starve the others. A small cursor can resume the next safe batch.
 */
export function createRecordViewPaginator(
  view,
  { itemLimit = RECORD_PAGE_ITEM_LIMIT, cursor } = {},
) {
  assertView(view)
  assertItemLimit(itemLimit)

  const totalItems = view.pools.reduce((sum, pool) => sum + pool.items.length, 0)
  const totalPages = Math.max(1, Math.ceil(totalItems / itemLimit))
  const restored = restoreCursor(view, totalItems, totalPages, itemLimit, cursor)
  const positions = restored.positions
  let poolCursor = restored.poolCursor
  let pageIndex = restored.pageIndex
  let remaining = totalItems - positions.reduce((sum, position) => sum + position, 0)

  function next() {
    if (totalItems === 0) {
      if (pageIndex > 0) return undefined
      pageIndex = 1
      return buildPage(
        view,
        new Map(),
        { page: 1, total: 1, totalItems: 0 },
        { preserveAllPools: true },
      )
    }
    if (remaining <= 0) return undefined

    const selections = new Map()
    let availableSlots = itemLimit

    while (availableSlots > 0 && remaining > 0) {
      let selectedPool = -1
      for (let offset = 0; offset < view.pools.length; offset += 1) {
        const candidate = (poolCursor + offset) % view.pools.length
        if (positions[candidate] < view.pools[candidate].items.length) {
          selectedPool = candidate
          break
        }
      }
      if (selectedPool === -1) break

      const sourceItems = view.pools[selectedPool].items
      const start = positions[selectedPool]
      const take = Math.min(
        POOL_TURN_ITEM_LIMIT,
        availableSlots,
        sourceItems.length - start,
      )
      const selectedItems = selections.get(selectedPool) ?? []
      selectedItems.push(...sourceItems.slice(start, start + take))
      selections.set(selectedPool, selectedItems)

      positions[selectedPool] += take
      availableSlots -= take
      remaining -= take
      poolCursor = (selectedPool + 1) % view.pools.length
    }

    pageIndex += 1
    return buildPage(view, selections, {
      page: pageIndex,
      total: totalPages,
      totalItems,
    })
  }

  return Object.freeze({
    totalItems,
    totalPages,
    hasNext: () => totalItems === 0 ? pageIndex === 0 : remaining > 0,
    next,
    take(pageLimit) {
      assertPageLimit(pageLimit)
      const pages = []
      while (pages.length < pageLimit) {
        const page = next()
        if (!page) break
        pages.push(page)
      }
      return Object.freeze(pages)
    },
    cursor() {
      return cloneFrozen({ positions: [...positions], poolCursor, pageIndex })
    },
  })
}

/** Drain every page for preview and test callers. Runtime message delivery uses
 * createRecordViewPaginator().take() so untrusted histories stay batch-bounded.
 */
export function paginateRecordView(view, options = {}) {
  const paginator = createRecordViewPaginator(view, options)
  return paginator.take(paginator.totalPages)
}
