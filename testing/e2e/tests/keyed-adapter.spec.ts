import { test, expect } from './fixtures'

test.describe('keyedAdapter', () => {
  test('builds the adapter with the key from the BYOK header', async ({
    request,
    testId,
  }) => {
    const response = await request.post('/api/keyed-adapter', {
      headers: { 'x-byok-openai': 'sk-e2e-keyed-1234', 'x-test-id': testId },
    })

    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.text).toContain('Fender Stratocaster')
    expect(body.authorization).toBe('Bearer sk-e2e-keyed-1234')
  })

  test('answers byok_missing when the request has no key', async ({
    request,
  }) => {
    const response = await request.post('/api/keyed-adapter')

    expect(response.status()).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { type: 'byok_missing', provider: 'openai' },
    })
  })
})
