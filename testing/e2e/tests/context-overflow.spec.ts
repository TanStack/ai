import { test, expect } from './fixtures'

/**
 * aimock answers `[context-overflow-*]` with the provider's own context
 * overflow error. The adapter maps it, and the `RUN_ERROR` that `chat()`
 * yields carries the stable `context_overflow` code with the provider's text.
 */
for (const [api, text] of [
  ['anthropic', 'prompt is too long'],
  ['openai-responses', 'maximum context length'],
  ['openai-chat-completions', 'maximum context length'],
] as const) {
  test(`${api} — context overflow gives RUN_ERROR code context_overflow`, async ({
    request,
  }) => {
    const res = await request.post(`/api/context-overflow?api=${api}`)
    expect(res.ok()).toBe(true)

    const { ok, runError, error } = (await res.json()) as {
      ok: boolean
      error?: string
      runError?: { code?: string; message: string }
    }

    expect(error ?? null).toBeNull()
    expect(ok).toBe(true)
    expect(runError?.code).toBe('context_overflow')
    expect(runError?.message).toContain(text)
  })
}
