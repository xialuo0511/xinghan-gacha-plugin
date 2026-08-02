import assert from "node:assert/strict"
import test from "node:test"

import {
  GACHA_ENDPOINT_LIST,
  TRUSTED_GACHA_HOSTS,
  getEndpointCandidates,
} from "../../src/protocol/endpoints.js"

test("all gacha endpoints are HTTPS and their exact hosts are registered", () => {
  assert.ok(GACHA_ENDPOINT_LIST.length > 0)
  for (const endpoint of GACHA_ENDPOINT_LIST) {
    const url = new URL(endpoint.url)
    assert.equal(url.protocol, "https:")
    assert.equal(TRUSTED_GACHA_HOSTS.includes(url.hostname), true)
    assert.equal(url.search, "")
    assert.equal(url.hash, "")
  }
})

test("primary endpoints precede explicitly marked fallbacks", () => {
  for (const game of ["genshin", "starrail", "zzz"]) {
    for (const market of ["cn", "global"]) {
      for (const kind of ["standard", "collaboration"]) {
        let candidates
        try {
          candidates = getEndpointCandidates(game, market, kind)
        } catch {
          continue
        }
        assert.equal(candidates[0].fallback, false)
        for (const candidate of candidates.slice(1)) assert.equal(candidate.fallback, true)
      }
    }
  }
})

test("Star Rail collaboration endpoints use getLdGachaLog", () => {
  for (const market of ["cn", "global"]) {
    for (const endpoint of getEndpointCandidates("starrail", market, "collaboration")) {
      assert.equal(new URL(endpoint.url).pathname.endsWith("/getLdGachaLog"), true)
    }
  }
})
