import { test, expect } from './fixtures'

/**
 * Regression for #1597. An Anthropic stream that stops at `max_tokens` ends in
 * `RUN_ERROR`, and Anthropic bills the tokens of that call. The `RUN_ERROR`
 * must carry them. aimock sends the input count only on `message_start`, so
 * the input count must survive a closing `message_delta` without it.
 */
test.describe('anthropic — max_tokens stop', () => {
  test('RUN_ERROR carries the input and output tokens', async ({ request }) => {
    const res = await request.post('/api/anthropic-max-tokens-usage')
    expect(res.ok()).toBe(true)

    const { ok, runError, error } = (await res.json()) as {
      ok: boolean
      error?: string
      runError?: { code?: string; usage?: Record<string, unknown> }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runError?.code).toBe('max_tokens')
    expect(runError?.usage).toEqual({
      promptTokens: 13,
      completionTokens: 3,
      totalTokens: 16,
    })
  })
})
