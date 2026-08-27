import type { TokenUsage } from '@tanstack/ai'

const FAL_BILLABLE_UNITS_HEADER = 'x-fal-billable-units'

const FAL_REQUEST_ID_HEADER = 'x-fal-request-id'

const MAX_PENDING_ENTRIES = 256

const billableUnitsByRequestId = new Map<string, number>()

export function parseBillableUnits(value: string | null): number | undefined {
  if (value == null) return undefined
  if (value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function recordBillableUnitsFromResponse(response: Response): void {
  const units = parseBillableUnits(
    response.headers.get(FAL_BILLABLE_UNITS_HEADER),
  )
  if (units == null) return
  const requestId = response.headers.get(FAL_REQUEST_ID_HEADER)
  if (!requestId) return
  const evictOldest =
    billableUnitsByRequestId.size >= MAX_PENDING_ENTRIES &&
    !billableUnitsByRequestId.has(requestId)
  if (evictOldest) {
    const oldest = billableUnitsByRequestId.keys().next().value
    if (oldest !== undefined) billableUnitsByRequestId.delete(oldest)
  }
  billableUnitsByRequestId.set(requestId, units)
}

export function takeBillableUnits(
  requestId: string | undefined,
): number | undefined {
  if (!requestId) return undefined
  const units = billableUnitsByRequestId.get(requestId)
  if (units !== undefined) billableUnitsByRequestId.delete(requestId)
  return units
}

export function buildFalUsage(
  unitsBilled: number | undefined,
): TokenUsage | undefined {
  if (unitsBilled == null) return undefined
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    billed: { quantity: unitsBilled, unit: 'units' },
    unitsBilled,
  }
}

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
