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

test.describe('keyedAdapters', () => {
  test('builds the adapter of the provider whose key the user sent', async ({
    request,
    testId,
  }) => {
    const response = await request.post('/api/keyed-adapter?mode=many', {
      headers: { 'x-byok-anthropic': 'sk-e2e-keyed-5678', 'x-test-id': testId },
    })

    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.text).toContain('Fender Stratocaster')
    expect(body.provider).toBe('anthropic')
    expect(body.credential).toBe('sk-e2e-keyed-5678')
  })

  test('answers byok_missing when no provider has a key', async ({
    request,
  }) => {
    const response = await request.post('/api/keyed-adapter?mode=many')

    expect(response.status()).toBe(401)
  })
})
