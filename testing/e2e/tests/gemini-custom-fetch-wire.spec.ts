import { test, expect } from './fixtures'

/**
 * `/api/gemini-custom-fetch-wire` runs the real Gemini chat and image
 * adapters with `httpOptions.fetch` set to a fake `fetch`, and returns the
 * URLs that fetch got. The base URL is `https://gemini.invalid`, so a request
 * sent with the global `fetch` instead fails and never reaches the fake.
 */
test.describe('gemini -- httpOptions.fetch', () => {
  test('chat and image requests go through the custom fetch', async ({
    request,
  }) => {
    const response = await request.post('/api/gemini-custom-fetch-wire')
    expect(response.ok()).toBe(true)
    const result: {
      ok: boolean
      error?: string
      text?: string
      images?: number
      urls?: Array<string>
    } = await response.json()
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.text).toBe('Hi from fetch.')
    expect(result.images).toBe(1)
    expect(result.urls).toEqual([
      expect.stringContaining(
        '/v1beta/models/gemini-2.5-flash:streamGenerateContent',
      ),
      expect.stringContaining('/v1beta/interactions'),
    ])
  })
})
