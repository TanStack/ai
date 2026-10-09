import { test, expect } from './fixtures'

/**
 * aimock answers `[retry-after]` with a 429 and `Retry-After: 7`. The adapter
 * reads the header, and the `RUN_ERROR` that `chat()` yields carries the wait
 * as `metadata.tanstack.retryAfterMs`.
 */
for (const api of [
  'anthropic',
  'openai-responses',
  'openai-chat-completions',
] as const) {
  test.describe(`${api} — 429 with retry-after`, () => {
    test('RUN_ERROR carries retryAfterMs', async ({ request }) => {
      const res = await request.post(`/api/retry-after?api=${api}`)
      expect(res.ok()).toBe(true)

      const { ok, runError, error } = (await res.json()) as {
        ok: boolean
        error?: string
        runError?: { message?: string; retryAfterMs?: number }
      }

      expect(error ?? null).toBeNull()
      expect(ok).toBe(true)
      expect(runError?.retryAfterMs).toBe(7000)
    })
  })
}
