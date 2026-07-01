import { test, expect } from './fixtures'

/**
 * Issue #604 regression test — `webFetchTool()` mixed with a user client
 * tool.
 *
 * Pre-fix, when Claude returned a client `tool_use` followed by a
 * `server_tool_use` (web_fetch) in the same streaming response, the server
 * tool's `input_json_delta`s appended onto the client tool's input buffer.
 * The agent loop's downstream `JSON.parse` then threw on the concatenated
 * JSON, so any user calling `chat({ tools: [myTool, webFetchTool()] })`
 * could hit "Failed to parse tool arguments as JSON" the moment Claude
 * called both in one turn.
 *
 * The bug shape can't be reproduced through aimock's built-in handlers —
 * aimock has no concept of `server_tool_use` blocks. The
 * `/anthropic-bug-test` mount in `global-setup.ts` hand-crafts the exact
 * SSE Claude emits, and `/api/anthropic-bug-test` runs the Anthropic
 * adapter against it with a real `webFetchTool()` in the tools array.
 */
test.describe('anthropic — webFetchTool() streaming (#604)', () => {
  test('user tool + webFetchTool() in the same turn completes cleanly', async ({
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
    // The adapter's `TOOL_CALL_END` carries the parsed `input` — where the
    // pre-fix `JSON.parse(concatenatedArgs)` blew up.
    const toolCallArgEnds = chunks.filter(
      (c) =>
        c.type === 'TOOL_CALL_END' &&
        (c as { input?: unknown }).input !== undefined,
    )

    // Exactly one client tool call. `web_fetch` is executed by Anthropic
    // server-side, not surfaced as a client tool call.
    expect(toolCallStarts).toHaveLength(1)
    expect(toolCallArgEnds).toHaveLength(1)
    expect(toolCallStarts[0]).toMatchObject({
      toolCallId: 'toolu_client_weather',
      toolName: 'lookup_weather',
    })

    // Client tool args must be the clean Berlin payload — not the pre-fix
    // concatenated `{"location":"Berlin"}{"url":"..."}`.
    expect(toolCallArgEnds[0]).toMatchObject({
      toolCallId: 'toolu_client_weather',
      input: { location: 'Berlin' },
    })

    // No phantom client tool call for the server-side web_fetch.
    expect(
      toolCallStarts.some(
        (c) =>
          (c as { toolCallId?: string }).toolCallId === 'srvtoolu_web_fetch',
      ),
    ).toBe(false)

    // Run completes cleanly through the agent loop's follow-up turn.
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
  })
})
