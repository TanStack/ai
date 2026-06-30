import { test, expect } from './fixtures'

/**
 * Regression for #758. `AnthropicTextAdapter` has no native
 * `structuredOutputStream`, so `chat({ outputSchema, stream: true })` runs
 * through the activity layer's `fallbackStructuredOutputStream`. That wrapper
 * used to drop the `usage` returned by `structuredOutput()`, so consumers
 * reading `RUN_FINISHED.usage` (and the `runOnUsage` middleware hook) saw
 * `undefined` on every fallback-path provider.
 *
 * The `/api/anthropic-structured-usage` route drives the adapter against an
 * aimock mount whose tool-forced `structured_output` response carries
 * `input_tokens` / `output_tokens` / `cache_read_input_tokens`. This is the
 * end-to-end proof that usage now survives the fallback path onto
 * `RUN_FINISHED.usage`.
 */
test.describe('anthropic — structured-output fallback usage (#758)', () => {
  test('usage reaches RUN_FINISHED.usage on the fallback path', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-structured-usage')
    expect(res.ok()).toBe(true)

    const { ok, usage, error } = (await res.json()) as {
      ok: boolean
      error?: string
      usage?: {
        promptTokens?: number
        completionTokens?: number
        totalTokens?: number
        promptTokensDetails?: { cachedTokens?: number }
      }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(usage).toMatchObject({
      promptTokens: 125,
      completionTokens: 1346,
      totalTokens: 1471,
      promptTokensDetails: { cachedTokens: 5760 },
    })
  })
})
