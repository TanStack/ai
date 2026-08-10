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
  test.beforeEach(async ({ request, aimockPort }) => {
    // Clear the aimock journal so we only assert against the request this
    // test triggers — adjacent specs share the same aimock instance.
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

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

    const tools = await readCapturedTools(request, aimockPort)

    expect(tools).toContainEqual(
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({
          name: 'google_search',
          // Gemini's schema converter upper-cases JSON Schema types.
          parameters: expect.objectContaining({
            properties: { query: { type: 'STRING' } },
          }),
        }),
      }),
    )
  })
})

async function readCapturedTools(
  request: APIRequestContext,
  aimockPort: number,
): Promise<Array<Record<string, unknown>>> {
  const response = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await response.json()) as Array<{
    body: { tools?: Array<Record<string, unknown>> } | null
  }>
  return entries[0]?.body?.tools ?? []
}
