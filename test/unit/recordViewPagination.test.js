import assert from "node:assert/strict"
import test from "node:test"

import {
  createRecordViewPaginator,
  paginateRecordView,
  RECORD_PAGE_ITEM_LIMIT,
} from "../../src/view/recordViewPagination.js"

function pool(poolIndex, itemCount, overrides = {}) {
  return {
    queryType: String(poolIndex + 1),
    name: `卡池 ${poolIndex + 1}`,
    total: itemCount * 10,
    highCount: itemCount,
    currentPity: poolIndex,
    items: Array.from({ length: itemCount }, (_, itemIndex) => ({
      id: `${poolIndex + 1}-${itemIndex + 1}`,
      name: `结果 ${poolIndex + 1}-${itemIndex + 1}`,
      detail: { poolIndex, itemIndex },
    })),
    ...overrides,
  }
}

function viewWithCounts(counts, extraPools = []) {
  return {
    game: "genshin",
    uid: "123456789",
    theme: { title: "原神祈愿记录" },
    summary: { total: counts.reduce((sum, count) => sum + count * 10, 0) },
    pools: [...counts.map((count, index) => pool(index, count)), ...extraPools],
  }
}

function pageItemCount(page) {
  return page.pools.reduce((sum, currentPool) => sum + currentPool.items.length, 0)
}

function idsByPool(pages) {
  const result = new Map()
  for (const page of pages) {
    for (const currentPool of page.pools) {
      const ids = result.get(currentPool.queryType) ?? []
      ids.push(...currentPool.items.map(item => item.id))
      result.set(currentPool.queryType, ids)
    }
  }
  return result
}

function assertPagination(view, pages, expectedTotalItems) {
  assert.ok(Object.isFrozen(pages))
  assert.equal(pages.length, Math.max(1, Math.ceil(expectedTotalItems / 24)))

  for (const [index, page] of pages.entries()) {
    assert.ok(Object.isFrozen(page))
    assert.ok(Object.isFrozen(page.pagination))
    assert.ok(Object.isFrozen(page.pools))
    assert.deepEqual(page.pagination, {
      page: index + 1,
      total: pages.length,
      totalItems: expectedTotalItems,
    })
    assert.ok(pageItemCount(page) <= RECORD_PAGE_ITEM_LIMIT)

    for (const currentPool of page.pools) {
      assert.ok(Object.isFrozen(currentPool))
      assert.ok(Object.isFrozen(currentPool.items))
      for (const item of currentPool.items) {
        assert.ok(Object.isFrozen(item))
        assert.ok(Object.isFrozen(item.detail))
      }
    }
  }

  const actualIds = idsByPool(pages)
  for (const sourcePool of view.pools) {
    if (sourcePool.items.length === 0) continue
    assert.deepEqual(
      actualIds.get(sourcePool.queryType),
      sourcePool.items.map(item => item.id),
    )
    assert.equal(new Set(actualIds.get(sourcePool.queryType)).size, sourcePool.items.length)
  }
}

test("exports a 24-item default page limit", () => {
  assert.equal(RECORD_PAGE_ITEM_LIMIT, 24)
})

test("returns one frozen clone of the original view when there are no items", () => {
  const view = viewWithCounts([], [
    pool(0, 0, { total: 30, highCount: 0 }),
    pool(1, 0, { total: 0, highCount: 0 }),
  ])
  const pages = paginateRecordView(view)

  assert.equal(pages.length, 1)
  assert.notEqual(pages[0], view)
  assert.equal(pages[0].pools.length, 2)
  assert.deepEqual(pages[0].pagination, { page: 1, total: 1, totalItems: 0 })
  assert.ok(Object.isFrozen(pages[0].theme))
  assert.ok(Object.isFrozen(pages[0].summary))
})

for (const itemCount of [1, 24, 25]) {
  test(`paginates ${itemCount} item(s) without loss or duplication`, () => {
    const view = viewWithCounts([itemCount])
    const pages = paginateRecordView(view)
    assertPagination(view, pages, itemCount)
  })
}

test("round-robins 100 items across three pools in four-item turns", () => {
  const view = viewWithCounts([40, 40, 20])
  const pages = paginateRecordView(view)

  assertPagination(view, pages, 100)
  assert.deepEqual(pages[0].pools.map(currentPool => currentPool.items.length), [8, 8, 8])
  assert.deepEqual(pages[1].pools.map(currentPool => currentPool.items.length), [8, 8, 8])
  assert.deepEqual(pages[2].pools.map(currentPool => currentPool.items.length), [12, 8, 4])
})

test("round-robins 100 items across six pools and keeps full pool statistics", () => {
  const view = viewWithCounts([17, 17, 17, 17, 16, 16])
  const pages = paginateRecordView(view)

  assertPagination(view, pages, 100)
  assert.deepEqual(pages[0].pools.map(currentPool => currentPool.items.length), [4, 4, 4, 4, 4, 4])
  assert.deepEqual(pages[3].pools.map(currentPool => currentPool.items.length), [4, 4, 4, 4, 4, 4])
  assert.deepEqual(pages[4].pools.map(currentPool => currentPool.items.length), [1, 1, 1, 1])

  for (const page of pages) {
    for (const pagePool of page.pools) {
      const sourcePool = view.pools.find(candidate => candidate.queryType === pagePool.queryType)
      assert.equal(pagePool.total, sourcePool.total)
      assert.equal(pagePool.highCount, sourcePool.highCount)
      assert.equal(pagePool.currentPity, sourcePool.currentPity)
    }
  }
})

test("keeps nonempty zero-high-rarity pools only on the first page", () => {
  const emptyPool = pool(2, 0, { total: 53, highCount: 0 })
  const view = viewWithCounts([25], [emptyPool])
  const pages = paginateRecordView(view)

  assert.equal(pages.length, 2)
  assert.deepEqual(pages[0].pools.map(currentPool => currentPool.queryType), ["1", "3"])
  assert.deepEqual(pages[1].pools.map(currentPool => currentPool.queryType), ["1"])
})

test("continues the fair pool cursor across page boundaries", () => {
  const view = viewWithCounts([8, 8, 8])
  const pages = paginateRecordView(view, { itemLimit: 4 })

  assert.equal(pages.length, 6)
  assert.deepEqual(
    pages.map(page => page.pools[0].queryType),
    ["1", "2", "3", "1", "2", "3"],
  )
  assert.ok(pages.every(page => pageItemCount(page) === 4))
})

test("resumes a large history from a small batch cursor without loss", () => {
  const view = viewWithCounts([400, 300, 300])
  const firstPaginator = createRecordViewPaginator(view)
  const firstBatch = firstPaginator.take(8)
  const cursor = firstPaginator.cursor()
  assert.equal(firstBatch.length, 8)
  assert.equal(cursor.pageIndex, 8)
  assert.equal(cursor.positions.reduce((sum, position) => sum + position, 0), 192)

  const resumed = createRecordViewPaginator(view, { cursor })
  const remainingPages = []
  while (resumed.hasNext()) remainingPages.push(...resumed.take(8))
  const pages = Object.freeze([...firstBatch, ...remainingPages])
  assertPagination(view, pages, 1_000)
  assert.equal(remainingPages[0].pagination.page, 9)
})

test("rejects a cursor whose progress does not match its page", () => {
  const view = viewWithCounts([25])
  assert.throws(
    () => createRecordViewPaginator(view, {
      cursor: { positions: [1], poolCursor: 0, pageIndex: 1 },
    }),
    RangeError,
  )
})

test("rejects malformed views and unsafe item limits", () => {
  assert.throws(() => paginateRecordView(null), TypeError)
  assert.throws(() => paginateRecordView({ pools: [{}] }), TypeError)
  assert.throws(() => paginateRecordView(viewWithCounts([1]), { itemLimit: 0 }), RangeError)
  assert.throws(
    () => paginateRecordView(viewWithCounts([1]), { itemLimit: Number.MAX_VALUE }),
    RangeError,
  )
})
