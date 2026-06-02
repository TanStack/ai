import { test, expect } from './fixtures'

/**
 * Issue #682 regression test — structured-output schema-rejection fallback.
 *
 * When a provider rejects an over-large structured-output schema on its native
 * path ("compiled grammar is too large"), `chat({ outputSchema })` under the
 * default `structuredOutput: 'auto'` transparently retries via the lenient
 * forced-tool path instead of surfacing a hard RUN_ERROR.
 *
 * - `anthropic` runs the full `'auto'` reject→recover against the
 *   `/structured-output-fallback` mount (native `output_config` → 400,
 *   `structured_output` tool → success).
 * - `openrouter` exercises the forced-tool path against standard aimock,
 *   replaying the `structured_output` tool fixture — proving the forced-tool
 *   wire round-trips through the real OpenRouter SDK. (The fixture stamps
 *   `systemFingerprint`, which the Speakeasy SDK requires as a non-undefined
 *   `system_fingerprint`; aimock omits it otherwise.)
 */
type FallbackResult = {
  chunks: Array<Record<string, unknown>>
  object: { name?: string; price?: number } | null
  error: string | null
}

function assertRecovered({ chunks, object, error }: FallbackResult) {
  // The fallback recovered the run — no terminal error reaches the consumer.
  expect(error).toBeNull()
  expect(chunks.some((c) => c.type === 'RUN_ERROR')).toBe(false)

  // The recovered run produced the schema-shaped object via the tool path.
  expect(object).toMatchObject({ name: 'Fender Stratocaster', price: 1299 })

  // A terminal structured-output.complete was emitted.
  expect(
    chunks.some(
      (c) =>
        c.type === 'CUSTOM' &&
        (c as { name?: string }).name === 'structured-output.complete',
    ),
  ).toBe(true)
}

for (const provider of ['anthropic', 'openrouter'] as const) {
  test.describe(`${provider} — structured-output fallback (#682)`, () => {
    test('resolves the structured object via the forced-tool path', async ({
      request,
    }) => {
      const res = await request.post('/api/structured-output-fallback', {
        data: { provider },
      })
      expect(res.ok()).toBe(true)
      assertRecovered((await res.json()) as FallbackResult)
    })
  })
}
