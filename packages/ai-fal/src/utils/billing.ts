import type { TokenUsage } from '@tanstack/ai'

/**
 * Response header fal sets on a queue *result* fetch carrying the real billed
 * quantity for the generation, denominated in the endpoint's priced unit.
 */
const FAL_BILLABLE_UNITS_HEADER = 'x-fal-billable-units'

/**
 * Response header fal sets carrying the request id. The fal client surfaces this
 * same value as `Result.requestId`, so keying captured billable units by it
 * guarantees the adapter's lookup matches the fetch the units came from — no URL
 * parsing or global correlation registry of our own design needed.
 */
const FAL_REQUEST_ID_HEADER = 'x-fal-request-id'

/**
 * Upper bound on retained, not-yet-consumed billable-unit entries. Each
 * successful generation reads-and-deletes its entry (see {@link takeBillableUnits}),
 * so this only guards against an unbounded leak when a result fetch records units
 * but the adapter never resolves (e.g. it throws before reading). When the cap is
 * exceeded the oldest entry is evicted (Map preserves insertion order).
 */
const MAX_PENDING_ENTRIES = 256

const billableUnitsByRequestId = new Map<string, number>()

/**
 * Parse the `x-fal-billable-units` header value into a finite number. Returns
 * `undefined` for a missing or non-numeric value so callers can skip attaching
 * usage rather than surfacing `NaN`.
 */
export function parseBillableUnits(value: string | null): number | undefined {
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Record the billable units carried by a fal result response, keyed by the
 * request id from the same response. Reading headers does not consume the body,
 * so the response can be returned to the fal client untouched.
 */
export function recordBillableUnitsFromResponse(response: Response): void {
  const units = parseBillableUnits(
    response.headers.get(FAL_BILLABLE_UNITS_HEADER),
  )
  if (units == null) return
  const requestId = response.headers.get(FAL_REQUEST_ID_HEADER)
  if (!requestId) return
  if (
    billableUnitsByRequestId.size >= MAX_PENDING_ENTRIES &&
    !billableUnitsByRequestId.has(requestId)
  ) {
    const oldest = billableUnitsByRequestId.keys().next().value
    if (oldest !== undefined) billableUnitsByRequestId.delete(oldest)
  }
  billableUnitsByRequestId.set(requestId, units)
}

/**
 * Read and remove the billable units recorded for a request id. Removing on read
 * keeps the registry from growing across the lifetime of the process.
 */
export function takeBillableUnits(
  requestId: string | undefined,
): number | undefined {
  if (!requestId) return undefined
  const units = billableUnitsByRequestId.get(requestId)
  if (units !== undefined) billableUnitsByRequestId.delete(requestId)
  return units
}

/**
 * Build a {@link TokenUsage} carrying fal's billed quantity. Media generation has
 * no tokens, so the token fields are zero and the real billing signal rides on
 * `unitsBilled` — mirroring how the duration-billed transcription adapters
 * surface `durationSeconds`. Returns `undefined` when no units were captured so
 * callers can omit `usage` entirely.
 */
export function buildFalUsage(
  unitsBilled: number | undefined,
): TokenUsage | undefined {
  if (unitsBilled == null) return undefined
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    unitsBilled,
  }
}

/**
 * Wrap a fetch so every fal request's response is inspected for the
 * `x-fal-billable-units` header before being returned untouched. Installed as
 * fal's `config.fetch`, which (unlike a global `responseHandler`) is honoured for
 * every request — the fal client forces `resultResponseHandler` per queue
 * operation, clobbering any configured response handler.
 *
 * `baseFetch` is the underlying implementation to delegate to (defaults to the
 * global `fetch`). Injecting it keeps usage capture working when a caller
 * supplies a custom fetch — a proxy, instrumentation, or a test mock — without
 * mutating any global.
 */
export function createBillingFetch(
  baseFetch: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init)
    try {
      recordBillableUnitsFromResponse(response)
    } catch {
      // Capturing usage must never break the underlying request.
    }
    return response
  }
}
