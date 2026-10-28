import { test, expect } from './fixtures'

test.describe('openrouter — retryCodes', () => {
  // The fixture answers the first request with a 429 and only the second with
  // content, so the text proves the SDK retried.
  test('retries a 429 when retryCodes includes it', async ({
    request,
    testId,
  }) => {
    const response = await request.post(
      `/api/openrouter-retry-codes?testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      text: 'Hello after retry',
      error: null,
    })
  })
})
