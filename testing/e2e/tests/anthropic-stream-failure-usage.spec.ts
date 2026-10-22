import { test, expect } from './fixtures'

/**
 * Regression for #1735. An Anthropic stream that fails after `message_start`
 * ends in `RUN_ERROR`, and Anthropic bills the input tokens of that call. The
 * `RUN_ERROR` must carry the counts that `message_start` reported.
 */
test.describe('anthropic stream that fails after message_start', () => {
  test('RUN_ERROR carries the message_start usage', async ({ request }) => {
    const res = await request.post('/api/anthropic-stream-failure-usage')
    expect(res.ok()).toBe(true)

    const { ok, runError, error } = (await res.json()) as {
      ok: boolean
      error?: string
      runError?: { usage?: Record<string, unknown> }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runError?.usage).toEqual({
      promptTokens: 18,
      completionTokens: 1,
      totalTokens: 19,
    })
  })
})
