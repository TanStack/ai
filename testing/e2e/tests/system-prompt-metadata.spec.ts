import { test, expect } from './fixtures'

/**
 * End-to-end coverage for `systemPrompts: [{ content, metadata: { cache_control } }]`
 * on the Anthropic adapter.
 *
 * Wire-shape coverage lives in the unit test
 * `packages/typescript/ai-anthropic/tests/anthropic-adapter.test.ts` —
 * `it('attaches cache_control to system TextBlockParams via systemPrompts
 * metadata')` directly inspects the body passed to the Anthropic SDK and
 * asserts the structured `system: [{ type: 'text', text, cache_control }]`
 * payload. Replicating that assertion here is impossible: aimock's
 * journal normalises Anthropic requests into an OpenAI-shaped
 * `ChatCompletionRequest` for storage and drops unknown fields like
 * `cache_control` in the process.
 *
 * What this spec covers (which the unit test cannot):
 *  - `chatParamsFromRequestBody` accepts the request without rejecting
 *    `forwardedProps.systemPromptCacheControl`.
 *  - The object-form `systemPrompts` shape survives the JSON wire from
 *    test → route → adapter without throwing (in particular,
 *    `normalizeSystemPrompts`' runtime validation accepts the shape).
 *  - The Anthropic SDK accepts the request as built (a malformed
 *    `system` TextBlockParam would be rejected by the SDK or aimock).
 *  - The stream completes with `RUN_FINISHED`, proving the full
 *    middleware → adapter → SDK → server path is unaffected by the
 *    presence of `metadata.cache_control`.
 */
test.describe('Anthropic systemPrompts metadata — wire path', () => {
  test('object-form systemPrompts with metadata.cache_control completes end-to-end on Anthropic', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const body = {
      threadId: 'thread-sysprompt-meta-1',
      runId: 'run-sysprompt-meta-1',
      state: {},
      messages: [
        { id: 'u1', role: 'user', content: '[chat] recommend a guitar' },
      ],
      tools: [],
      context: [],
      forwardedProps: {
        provider: 'anthropic',
        feature: 'chat',
        testId,
        aimockPort,
        // Opt-in flag handled by `api.chat.ts` — promotes the system
        // prompt to object-form `{ content, metadata: { cache_control:
        // { type: 'ephemeral' } } }`. Exercising this flag with the
        // matching aimock fixture proves the full HTTP path tolerates the
        // structured shape end-to-end.
        systemPromptCacheControl: true,
      },
    }
    const response = await request.post('/api/chat', {
      data: body,
      headers: { 'Content-Type': 'application/json' },
    })
    expect(
      response.ok(),
      `expected 200, got ${response.status()}: ${await response.text()}`,
    ).toBe(true)
    const text = await response.text()
    expect(text).toContain('RUN_FINISHED')
    // No RUN_ERROR — the adapter accepted the structured system prompt
    // and the SDK accepted the resulting `TextBlockParam` array. (See the
    // unit test for the actual wire-shape assertion.)
    expect(text).not.toContain('RUN_ERROR')
  })
})
