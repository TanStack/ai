import { test, expect } from './fixtures'

/**
 * Issue #604 regression test.
 *
 * Before the fix, a Claude streaming response that emitted a client
 * `tool_use` followed by a `server_tool_use` (web_fetch) caused the server
 * tool's `input_json_delta`s to be appended onto the client tool's input
 * buffer. The agent loop's downstream `JSON.parse` then threw on the
 * concatenated JSON. A secondary failure mode was a server-tool-only
 * response causing a phantom client `TOOL_CALL_START` for the server tool.
 *
 * The bug shape can't be reproduced through aimock's built-in handlers —
 * aimock has no concept of `server_tool_use` blocks. The
 * `/anthropic-bug-test` mount in `global-setup.ts` hand-crafts the exact
 * SSE Claude emits, and `/api/anthropic-bug-test` runs the adapter against
 * it and returns the resulting stream chunks for assertion.
 */
test.describe('anthropic — server_tool_use streaming (#604)', () => {
  test('client tool_use args stay clean when followed by web_fetch server_tool_use', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-bug-test')
    expect(res.ok()).toBe(true)
    const { chunks, error } = (await res.json()) as {
      chunks: Array<Record<string, unknown>>
      error: string | null
    }

    // The bug threw `Failed to parse tool arguments as JSON: {...}{"url":...}`
    // in the agent loop. The fix means no error reaches the consumer.
    expect(error).toBeNull()

    const toolCallStarts = chunks.filter((c) => c.type === 'TOOL_CALL_START')
    // `TOOL_CALL_END` is emitted twice per call: once by the adapter with the
    // parsed `input`, and once by the tool runner with the execution
    // `result`. The bug shape is in the first one — that's where the
    // pre-fix `JSON.parse(concatenatedArgs)` blew up.
    const toolCallArgEnds = chunks.filter(
      (c) =>
        c.type === 'TOOL_CALL_END' &&
        (c as { input?: unknown }).input !== undefined,
    )

    // Exactly one client tool call. The `web_fetch` server tool is executed
    // by Anthropic, not surfaced as a client tool call.
    expect(toolCallStarts).toHaveLength(1)
    expect(toolCallArgEnds).toHaveLength(1)
    expect(toolCallStarts[0]).toMatchObject({
      toolCallId: 'toolu_client_weather',
      toolName: 'lookup_weather',
    })

    // Client tool args must be the clean Berlin payload — not the
    // pre-fix concatenated `{"location":"Berlin"}{"url":"..."}`.
    expect(toolCallArgEnds[0]).toMatchObject({
      toolCallId: 'toolu_client_weather',
      input: { location: 'Berlin' },
    })

    // No phantom client tool call for the server-side web_fetch.
    expect(
      toolCallStarts.some(
        (c) => (c as { toolCallId?: string }).toolCallId === 'srvtoolu_web_fetch',
      ),
    ).toBe(false)

    // Run completes cleanly through the agent loop's follow-up turn.
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
  })
})
