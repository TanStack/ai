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

/**
 * `chat({ retry })`: aimock answers `[chat-retry]` with a 429 and
 * `Retry-After: 1` first, then with text. `chat()` waits and calls the model
 * again, so the stream has the text and no `RUN_ERROR`.
 */
test('chat({ retry }) calls the model again after a 429', async ({
  request,
  testId,
}) => {
  const res = await request.post(
    `/api/retry-after?mode=retry&testId=${encodeURIComponent(testId)}`,
  )
  expect(res.ok()).toBe(true)

  const { ok, types, text } = (await res.json()) as {
    ok: boolean
    types: Array<string>
    text: string
  }

  expect(ok).toBe(true)
  expect(types).not.toContain('RUN_ERROR')
  expect(text).toBe('hello after the wait')
})
