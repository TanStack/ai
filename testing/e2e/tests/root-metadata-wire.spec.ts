import { test, expect } from './fixtures'

/**
 * End-to-end regression coverage for #735: root-level observability
 * `metadata` on `chat()` must never be forwarded onto the provider wire
 * request.
 *
 * In `@tanstack/ai-openrouter` 0.13.x the chat-completions mapper copied
 * root `metadata` into OpenRouter's `chatRequest.metadata`. The
 * `@openrouter/sdk` validates that field as `Record<string, string>`
 * client-side, so structured observability metadata (objects, arrays —
 * the documented usage for middleware/devtools consumers) failed Zod
 * validation before the request ever left the process, killing every
 * call with `RUN_ERROR`.
 *
 * Wire-shape coverage lives in the unit tests
 * `packages/ai-openrouter/tests/openrouter-adapter.test.ts` and
 * `openrouter-responses-adapter.test.ts`, which inspect the request
 * handed to the SDK directly. What this spec covers (which those
 * cannot): the full HTTP path — test → route → `chat()` → adapter →
 * real `@openrouter/sdk` outbound validation — tolerates structured
 * root metadata. Pre-fix, the SDK's own Zod schema rejects the request
 * and the stream emits RUN_ERROR instead of completing.
 */
test.describe('root observability metadata — wire path', () => {
  test('chat completes end-to-end on OpenRouter without the root metadata reaching the wire request', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const body = {
      threadId: 'thread-root-meta-1',
      runId: 'run-root-meta-1',
      state: {},
      messages: [
        { id: 'u1', role: 'user', content: '[chat] recommend a guitar' },
      ],
      tools: [],
      context: [],
      forwardedProps: {
        provider: 'openrouter',
        feature: 'chat',
        testId,
        aimockPort,
        // Opt-in flag handled by `api.chat.ts` — passes structured
        // root-level observability metadata (arrays, nested objects) to
        // `chat()`. The adapter must keep it off the provider request;
        // pre-fix, the SDK's own outbound Zod validation rejects the
        // request before it reaches aimock and the stream ends in
        // RUN_ERROR.
        structuredRootMetadata: true,
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
    // No RUN_ERROR — the @openrouter/sdk's outbound Record<string, string>
    // validation never saw the structured metadata.
    expect(text).not.toContain('RUN_ERROR')
  })
})
