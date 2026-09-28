import { test, expect } from './fixtures'

/**
 * `/api/moonshot-usage-details` streams a chat through the OpenAI-compatible
 * adapter from a mount that returns Moonshot's usage shape. Cache reads and
 * cache writes must reach `RUN_FINISHED.usage`.
 */
test.describe('openai-compatible — Moonshot usage', () => {
  test('cache read and cache write tokens reach RUN_FINISHED.usage', async ({
    request,
  }) => {
    const res = await request.post('/api/moonshot-usage-details')
    expect(res.ok()).toBe(true)

    const { ok, usage, error } = (await res.json()) as {
      ok: boolean
      error?: string
      usage?: {
        promptTokensDetails?: {
          cachedTokens?: number
          cacheWriteTokens?: number
        }
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(usage).toMatchObject({
      promptTokens: 1000,
      completionTokens: 50,
      totalTokens: 1050,
      promptTokensDetails: { cachedTokens: 800, cacheWriteTokens: 150 },
    })
  })
})
