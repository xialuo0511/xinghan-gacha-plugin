import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../resources/records/", import.meta.url)

test("record templates are local-only and provide distinct game themes", async () => {
  for (const game of ["genshin", "starrail", "zzz"]) {
    const html = await readFile(new URL(`${game}.html`, root), "utf8")
    assert.match(html, new RegExp(`theme-${game}`))
    assert.match(html, /\{\{@ viewJson\}\}/)
    assert.match(html, /\{\{cssUrl\}\}/)
    assert.match(html, /\{\{scriptUrl\}\}/)
    assert.equal(/https?:\/\//i.test(html), false)
  }
})

test("shared record page code inserts remote names as text, not HTML", async () => {
  const source = await readFile(new URL("base.js", root), "utf8")
  assert.match(source, /textContent/)
  assert.equal(source.includes("innerHTML"), false)
  assert.equal(/https?:\/\//i.test(source), false)
})
