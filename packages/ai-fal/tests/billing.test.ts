import { describe, expect, it, vi } from 'vitest'
import {
  buildFalUsage,
  createBillingFetch,
  parseBillableUnits,
  recordBillableUnitsFromResponse,
  takeBillableUnits,
} from '../src/utils/billing'

function resultResponse(
  headers: Record<string, string>,
  body: BodyInit | null = null,
): Response {
  return new Response(body, { headers })
}

describe('parseBillableUnits', () => {
  it('parses integer and fractional values', () => {
    expect(parseBillableUnits('4')).toBe(4)
    expect(parseBillableUnits('1.5')).toBe(1.5)
    expect(parseBillableUnits('0')).toBe(0)
  })

  it('returns undefined for missing or non-numeric values', () => {
    expect(parseBillableUnits(null)).toBeUndefined()
    expect(parseBillableUnits('')).toBeUndefined()
    expect(parseBillableUnits('not-a-number')).toBeUndefined()
  })
})

describe('recordBillableUnitsFromResponse / takeBillableUnits', () => {
  it('records billable units keyed by the request id header', () => {
    recordBillableUnitsFromResponse(
      resultResponse({
        'x-fal-request-id': 'req-record-1',
        'x-fal-billable-units': '6',
      }),
    )

    expect(takeBillableUnits('req-record-1')).toBe(6)
  })

  it('removes the entry on read so it is consumed once', () => {
    recordBillableUnitsFromResponse(
      resultResponse({
        'x-fal-request-id': 'req-record-2',
        'x-fal-billable-units': '3',
      }),
    )

    expect(takeBillableUnits('req-record-2')).toBe(3)
    expect(takeBillableUnits('req-record-2')).toBeUndefined()
  })

  it('ignores responses without a billable-units header', () => {
    recordBillableUnitsFromResponse(
      resultResponse({ 'x-fal-request-id': 'req-record-3' }),
    )

    expect(takeBillableUnits('req-record-3')).toBeUndefined()
  })

  it('ignores responses with billable units but no request id', () => {
    // No request id means there is nothing to correlate the units against.
    expect(() =>
      recordBillableUnitsFromResponse(
        resultResponse({ 'x-fal-billable-units': '9' }),
      ),
    ).not.toThrow()
  })

  it('returns undefined for an unknown or missing request id', () => {
    expect(takeBillableUnits('never-recorded')).toBeUndefined()
    expect(takeBillableUnits(undefined)).toBeUndefined()
  })
})

describe('buildFalUsage', () => {
  it('returns undefined when no units were captured', () => {
    expect(buildFalUsage(undefined)).toBeUndefined()
  })

  it('surfaces billable units on a zero-token usage object', () => {
    expect(buildFalUsage(4)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      billed: { quantity: 4, unit: 'units' },
      unitsBilled: 4,
    })
  })

  it('preserves a zero billed quantity', () => {
    expect(buildFalUsage(0)).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      billed: { quantity: 0, unit: 'units' },
      unitsBilled: 0,
    })
  })
})

describe('createBillingFetch', () => {
  it('records the header and returns the response with its body intact', async () => {
    const mockResponse = resultResponse(
      {
        'x-fal-request-id': 'req-fetch-1',
        'x-fal-billable-units': '7',
        'content-type': 'application/json',
      },
      JSON.stringify({ ok: true }),
    )
    // Inject the underlying fetch directly — no global to stub or restore.
    const baseFetch = vi.fn().mockResolvedValue(mockResponse)

    const billingFetch = createBillingFetch(baseFetch)
    const returned = await billingFetch(
      'https://queue.fal.run/fal-ai/flux/requests/req-fetch-1',
    )

    expect(returned).toBe(mockResponse)
    expect(baseFetch).toHaveBeenCalledTimes(1)
    // Reading headers must not consume the body — the fal client still parses it.
    await expect(returned.json()).resolves.toEqual({ ok: true })
    expect(takeBillableUnits('req-fetch-1')).toBe(7)
  })

  it('passes through responses without the billable-units header', async () => {
    const mockResponse = resultResponse({ 'x-fal-request-id': 'req-fetch-2' })
    const baseFetch = vi.fn().mockResolvedValue(mockResponse)

    const billingFetch = createBillingFetch(baseFetch)
    await billingFetch('https://queue.fal.run/fal-ai/flux/requests/req-fetch-2')

    expect(takeBillableUnits('req-fetch-2')).toBeUndefined()
  })
})
