import { test, expect } from './fixtures'

test.describe('openrouter responses — error_type', () => {
  test('puts the error_type of response.failed on the RUN_ERROR', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/openrouter-responses-error-type-wire',
    )
    expect(response.ok()).toBe(true)
    expect(await response.json()).toEqual({
      code: 'server_error',
      errorType: 'provider_overloaded',
    })
  })
})
