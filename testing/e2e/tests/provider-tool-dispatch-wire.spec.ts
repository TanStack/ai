import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * An ordinary function whose public name collides with a provider-native tool
 * must reach the provider as a plain function tool, keeping its schema.
 *
 * Before the runtime-discriminator fix the Gemini converter dispatched on
 * `tool.name`, so a user function called `google_search` was swallowed into
 * `{googleSearch: {...}}` and its `parameters` were lost entirely.
 *
 * Reading the assertion: aimock's `/v1/_requests` journal does NOT store the
 * raw provider body — the Gemini handler records the request already normalized
 * into the Chat-Completions envelope (`geminiToCompletionRequest`), which is why
 * the tool appears as `{type:'function', function:{...}}` rather than Gemini's
 * `functionDeclarations`. Do not "correct" this to the provider-native shape;
 * the journal cannot produce it.
 *
 * That normalization is exactly what gives the assertion teeth: only tools that
 * survive as functions appear in the journal, so a misrouted tool vanishes.
 * Verified against the pre-fix converter — the captured `tools` array comes
 * back empty and this expectation fails.
 *
 * The OpenAI leg of the same fix cannot be covered from this app; see the note
 * in `api.provider-tool-dispatch-wire.ts` for why, and
 * `packages/openai-base/tests/provider-tool-dispatch.test.ts` for where it is
 * covered instead.
 */
test.describe('provider tools — custom-name wire dispatch', () => {
  test('Gemini preserves google_search as a function declaration', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const response = await request.post(
      `/api/provider-tool-dispatch-wire?provider=gemini&testId=${encodeURIComponent(testId)}`,
    )
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as { ok: boolean; error?: string }
    expect(result, result.error).toMatchObject({ ok: true })

    const tools = await readCapturedTools(request, aimockPort, testId)

    expect(tools).toContainEqual(
      expect.objectContaining({
        type: 'function',
        // Schema shape is deliberately not asserted here: the adapter sends it
        // as `parametersJsonSchema`, and aimock's journal copies only
        // `parameters`, so it never appears. The schema leg is covered by the
        // raw mount in `arktype-tool-wire.spec.ts`.
        function: expect.objectContaining({ name: 'google_search' }),
      }),
    )
  })
})

/**
 * Reads the tools this test's own request carried.
 *
 * aimock is a singleton shared by every Playwright worker, so neither clearing
 * the journal nor taking `entries[0]` is safe: a parallel spec can wipe the
 * journal between our write and our read, or land its own entry first.
 * `createTextAdapter` tags every provider call with an `X-Test-Id` header and
 * aimock stores request headers next to the body, so select this test's entry by
 * that id rather than mutating state other workers depend on.
 */
async function readCapturedTools(
  request: APIRequestContext,
  aimockPort: number,
  testId: string,
): Promise<Array<Record<string, unknown>>> {
  const response = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await response.json()) as Array<{
    headers?: Record<string, string>
    body: { tools?: Array<Record<string, unknown>> } | null
  }>

  const mine = entries.filter((entry) =>
    Object.entries(entry.headers ?? {}).some(
      ([key, value]) => key.toLowerCase() === 'x-test-id' && value === testId,
    ),
  )

  expect(
    mine,
    `no aimock journal entry carried X-Test-Id "${testId}"`,
  ).not.toHaveLength(0)

  return mine.flatMap((entry) => entry.body?.tools ?? [])
}
