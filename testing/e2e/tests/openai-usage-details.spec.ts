import { test, expect } from './fixtures'

/**
 * Verifies that detailed token-usage breakdowns reach `RUN_FINISHED.usage`. The
 * `/api/openai-usage-details` route drives the OpenAI chat adapter against an
 * aimock mount whose stream ends with a usage chunk carrying
 * `prompt_tokens_details.cached_tokens` and
 * `completion_tokens_details.reasoning_tokens`. The shared `@tanstack/openai-base`
 * extractor normalizes those into the canonical `TokenUsage` shape, so this is
 * the end-to-end proof that detailed usage survives the chat pipeline + SSE.
 */
test.describe('openai — detailed usage breakdown', () => {
  test('cached and reasoning token details reach RUN_FINISHED.usage', async ({
    request,
  }) => {
    const res = await request.post('/api/openai-usage-details')
    expect(res.ok()).toBe(true)

    const { ok, usage, error } = (await res.json()) as {
      ok: boolean
      error?: string
      usage?: {
        promptTokens?: number
        completionTokens?: number
        totalTokens?: number
        promptTokensDetails?: { cachedTokens?: number }
        completionTokensDetails?: { reasoningTokens?: number }
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      promptTokensDetails: { cachedTokens: 80 },
      completionTokensDetails: { reasoningTokens: 30 },
    })
  })
})
