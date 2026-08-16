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

test("Genshin uses the Snezhnaya theme and the shared grid never widens an odd pool", async () => {
  const [genshin, css] = await Promise.all([
    readFile(new URL("genshin.html", root), "utf8"),
    readFile(new URL("base.css", root), "utf8"),
  ])

  assert.match(genshin, /<body class="[^"]*theme-genshin[^"]*theme-snezhnaya[^"]*">/)
  assert.match(genshin, /--page-bg:\s*#cbd7e2/i)
  assert.match(genshin, /--header-bg:\s*#153c59/i)
  assert.match(css, /\.pool-board\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s)
  assert.match(css, /\.pool-column\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(css, /\.pool-results\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s)
  assert.match(css, /\.luck-hard\s*\{[^}]*--luck-color:\s*#[0-9a-f]{6}/is)
  assert.equal(/\.pool-panel:last-child:nth-child\(odd\)/.test(css), false)
  assert.equal(/repeat\(8,\s*minmax\(0,\s*1fr\)\)/.test(css), false)
})

test("shared record page code inserts remote names as text, not HTML", async () => {
  const source = await readFile(new URL("base.js", root), "utf8")
  assert.match(source, /textContent/)
  assert.equal(source.includes("innerHTML"), false)
  assert.equal(/https?:\/\//i.test(source), false)
})

test("bundles a compact real WebP fallback for missing local portraits", async () => {
  const image = await readFile(new URL("assets/item-fallback.webp", root))
  assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF")
  assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP")
  assert.equal(image.length < 100 * 1024, true)
})
