export class ProtocolError extends Error {
  constructor(code, message, { status, retcode } = {}) {
    super(message)
    this.name = "ProtocolError"
    this.code = code
    if (status !== undefined) this.status = status
    if (retcode !== undefined) this.retcode = retcode
  }
}

export async function requestJson(
  fetchImpl,
  { url, method = "GET", headers, body, timeoutMs = 10_000, signal },
) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required")

  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  let response
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body,
      redirect: "error",
      signal: requestSignal,
    })
  } catch {
    throw new ProtocolError("NETWORK_ERROR", "Remote request failed")
  }

  if (!response?.ok) {
    throw new ProtocolError("HTTP_ERROR", "Remote request returned an HTTP error", {
      status: response?.status,
    })
  }

  try {
    return { data: await response.json(), headers: response.headers, status: response.status }
  } catch {
    throw new ProtocolError("INVALID_JSON", "Remote response was not valid JSON", {
      status: response.status,
    })
  }
}

export function assertApiSuccess(payload, operation) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProtocolError("INVALID_RESPONSE", `${operation} returned an invalid response`)
  }
  if (payload.retcode !== 0) {
    throw new ProtocolError("REMOTE_ERROR", `${operation} was rejected`, {
      retcode: payload.retcode,
    })
  }
  return payload.data
}
