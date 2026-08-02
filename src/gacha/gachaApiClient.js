import { getGameAdapter } from "../games/registry.js"
import { getEndpointCandidates } from "../protocol/endpoints.js"
import { ProtocolError, requestJson } from "../protocol/http.js"
import { classifyGachaError } from "./errors.js"

function fallbackAllowed(error) {
  return error?.code === "NETWORK_ERROR" ||
    (error?.code === "HTTP_ERROR" && [404, 405].includes(error.status))
}

export class GachaApiClient {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.fetchImpl = fetchImpl
  }

  async fetchPage({ game, market, auth, pool, cursor = "0", page = 1, signal }) {
    const adapter = getGameAdapter(game)
    const candidates = getEndpointCandidates(game, market, pool.endpointKind)
    let lastError

    for (let index = 0; index < candidates.length; index += 1) {
      const endpoint = candidates[index]
      const url = new URL(endpoint.url)
      url.search = adapter.buildQuery(auth, pool, cursor, page)
      try {
        const response = await requestJson(this.fetchImpl, { url, signal })
        const payload = response.data
        if (!payload || typeof payload !== "object") {
          throw new ProtocolError("INVALID_GACHA_RESPONSE", "Gacha endpoint returned invalid data")
        }
        if (payload.retcode !== 0) throw classifyGachaError(payload)
        if (!Array.isArray(payload.data?.list)) {
          throw new ProtocolError("INVALID_GACHA_LIST", "Gacha endpoint returned no record list")
        }
        return Object.freeze({ list: payload.data.list, endpointKey: endpoint.key })
      } catch (error) {
        lastError = error
        const hasFallback = index + 1 < candidates.length
        if (!hasFallback || !fallbackAllowed(error)) throw error
      }
    }
    throw lastError
  }
}
