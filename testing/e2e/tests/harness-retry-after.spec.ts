import { test, expect } from './fixtures'

test.describe('harness: retry-after', () => {
  // The fixture answers the first request with a 429 and `Retry-After: 1`.
  // The backoff of the route is 60 seconds, so a quick answer proves that the
  // turn waited for the header.
  test('retries a 429 after its retry-after and ends with the answer', async ({
    request,
    testId,
  }) => {
    const response = await request.post(
      `/api/harness-retry-after?testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    const result: {
      error?: string
      text?: string
      retryAfterMs?: Array<number>
      waitedMs?: number
    } = await response.json()
    expect(result.error ?? null).toBeNull()
    expect(result.text).toBe('Hello after the wait')
    expect(result.retryAfterMs).toEqual([1000])
    expect(result.waitedMs).toBeGreaterThanOrEqual(1000)
    expect(result.waitedMs).toBeLessThan(30_000)
  })
})
