import assert from "node:assert/strict"
import test from "node:test"

import {
  GachaUrlError,
  parseGachaUrl,
  rebuildTrustedGachaUrl,
  summarizeParsedGachaUrl,
} from "../../src/gacha/urlParser.js"

function url(base, params) {
  const result = new URL(base)
  result.search = new URLSearchParams({
    authkey_ver: "1",
    sign_type: "2",
    auth_appid: "webview_gacha",
    authkey: "fixture/token+value=",
    lang: "zh-cn",
    size: "20",
    end_id: "0",
    ...params,
  })
  return result.href
}

const fixtures = {
  genshin: url("https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog", {
    game_biz: "hk4e_cn",
    region: "cn_gf01",
    gacha_type: "500",
  }),
  starrail: url(
    "https://public-operation-hkrpg-sg.hoyoverse.com/common/hkrpg_gacha_record/api/getLdGachaLog",
    {
      game_biz: "hkrpg_global",
      region: "prod_official_eur",
      gacha_type: "21",
    },
  ),
  zzz: url("https://public-operation-common.mihoyo.com/common/gacha_record/api/getGachaLog", {
    game_biz: "nap_cn",
    region: "prod_gf_cn",
    gacha_type: "12001",
    real_gacha_type: "102",
  }),
}

test("parses all three games using exact trusted endpoints", () => {
  assert.equal(parseGachaUrl(fixtures.genshin).pool.queryType, "500")
  assert.equal(parseGachaUrl(fixtures.starrail).pool.endpointKind, "collaboration")
  assert.equal(parseGachaUrl(fixtures.zzz).pool.longType, "12001")
})

test("rebuilds an alias URL with the local primary endpoint", () => {
  const parsed = parseGachaUrl(fixtures.zzz)
  const rebuilt = rebuildTrustedGachaUrl({
    ...parsed,
    optional: { ...parsed.optional, authkey: "must-not-override" },
  })

  assert.equal(rebuilt.hostname, "public-operation-nap.mihoyo.com")
  assert.equal(rebuilt.pathname, "/common/gacha_record/api/getGachaLog")
  assert.equal(rebuilt.searchParams.get("authkey"), "fixture/token+value=")
  assert.equal(rebuilt.searchParams.get("real_gacha_type"), "102")
  assert.equal(rebuilt.searchParams.get("gacha_type"), "12001")
  assert.deepEqual(summarizeParsedGachaUrl(parsed), {
    game: "zzz",
    market: "cn",
    gameBiz: "nap_cn",
    region: "prod_gf_cn",
    pool: "102",
    sourceEndpointKey: "zzz-cn-common-alias",
  })
})

const rejected = [
  ["HTTP", fixtures.genshin.replace("https://", "http://"), "HTTPS_REQUIRED"],
  [
    "lookalike host",
    fixtures.genshin.replace("public-operation-hk4e.mihoyo.com", "public-operation-hk4e.mihoyo.com.evil.test"),
    "UNTRUSTED_ENDPOINT",
  ],
  [
    "URL credentials",
    fixtures.genshin.replace("https://", "https://user:password@"),
    "USERINFO_FORBIDDEN",
  ],
  [
    "unknown path",
    fixtures.genshin.replace("/gacha_info/api/getGachaLog", "/gacha_info/api/other"),
    "UNTRUSTED_ENDPOINT",
  ],
  [
    "region mismatch",
    fixtures.genshin.replace("region=cn_gf01", "region=os_usa"),
    "REGION_MISMATCH",
  ],
  [
    "wrong collaboration endpoint",
    fixtures.starrail.replace("getLdGachaLog", "getGachaLog"),
    "ENDPOINT_KIND_MISMATCH",
  ],
  [
    "double encoded authkey",
    fixtures.genshin.replace("fixture%2Ftoken%2Bvalue%3D", "fixture%252Ftoken%252Bvalue%253D"),
    "DOUBLE_ENCODED_AUTHKEY",
  ],
  [
    "duplicate authkey",
    fixtures.genshin.replace("&lang=", "&authkey=second-value&lang="),
    "AMBIGUOUS_PARAMETER",
  ],
  [
    "mismatched ZZZ long pool type",
    fixtures.zzz.replace("gacha_type=12001", "gacha_type=13001"),
    "ZZZ_POOL_MISMATCH",
  ],
]

for (const [name, input, code] of rejected) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => parseGachaUrl(input),
      error => error instanceof GachaUrlError && error.code === code && !error.message.includes("fixture"),
    )
  })
}

test("rejects missing required parameters without exposing the URL", () => {
  const input = new URL(fixtures.genshin)
  input.searchParams.delete("authkey")
  assert.throws(
    () => parseGachaUrl(input.href),
    error =>
      error instanceof GachaUrlError &&
      error.code === "MISSING_PARAMETER" &&
      !error.message.includes(input.href),
  )
})
