import { test, expect } from './fixtures'

test.describe('embed() timeout', () => {
  test('rejects and cancels the provider request', async ({
    request,
    testId,
  }) => {
    const response = await request.post(
      `/api/embedding-abort?testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      errorName: 'TimeoutError',
      closedByClient: true,
    })
  })
})
