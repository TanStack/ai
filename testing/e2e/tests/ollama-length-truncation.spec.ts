import { test, expect } from './fixtures'

/**
 * An Ollama stream that stops at the `num_predict` limit
 * (`done_reason: 'length'`) must end in `RUN_FINISHED` with
 * `finishReason: 'length'`, not `'stop'`, so callers can tell the answer is
 * incomplete.
 */
test.describe('ollama — num_predict truncation', () => {
  test('RUN_FINISHED carries finishReason length', async ({ request }) => {
    const res = await request.post('/api/ollama-length-truncation')
    expect(res.ok()).toBe(true)

    const { ok, runError, finishReason, error } = (await res.json()) as {
      ok: boolean
      error?: string
      runError?: { code?: string }
      finishReason?: string
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runError).toBeUndefined()
    expect(finishReason).toBe('length')
  })
})
