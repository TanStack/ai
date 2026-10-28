import { test, expect } from './fixtures'

/**
 * Verifies that a Responses API cache write reaches `RUN_FINISHED.usage`
 * (#1734). The `/api/openai-responses-usage` route drives the OpenAI Responses
 * adapter against an aimock mount whose usage reports
 * `input_tokens_details.cache_write_tokens`.
 */
test.describe('openai — Responses usage breakdown', () => {
  test('cache write tokens reach RUN_FINISHED.usage', async ({ request }) => {
    const res = await request.post('/api/openai-responses-usage')
    expect(res.ok()).toBe(true)

    const { ok, usage, error } = (await res.json()) as {
      ok: boolean
      error?: string
      usage?: Record<string, unknown>
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(usage).toEqual({
      promptTokens: 1941,
      completionTokens: 5,
      totalTokens: 1946,
      promptTokensDetails: { cacheWriteTokens: 1938 },
    })
  })
})
