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
    const byId = (
      list: Array<Record<string, unknown>>,
      id: string,
    ): Record<string, unknown> | undefined =>
      list.find((c) => (c as { toolCallId?: string }).toolCallId === id)

    // Two tool calls surface: the client `lookup_weather` and the
    // Anthropic-executed `web_fetch`. The latter now streams as a
    // provider-executed tool call (#839) so its result can be replayed into
    // later turns — it is NOT routed to client-side execution.
    expect(toolCallStarts).toHaveLength(2)
    expect(byId(toolCallStarts, 'toolu_client_weather')).toMatchObject({
      toolCallId: 'toolu_client_weather',
      toolName: 'lookup_weather',
    })

    // The web_fetch start is flagged provider-executed (in metadata) and
    // carries the raw server tool result the adapter replays verbatim.
    expect(byId(toolCallStarts, 'srvtoolu_web_fetch')).toMatchObject({
      toolCallId: 'srvtoolu_web_fetch',
      toolName: 'web_fetch',
      metadata: {
        providerExecuted: true,
        anthropic: { resultBlockType: 'web_fetch_tool_result' },
      },
    })

    // Both tools surface a clean parsed `input` on TOOL_CALL_END. The client
    // tool's args must still be the Berlin payload — not the pre-fix
    // concatenated `{"location":"Berlin"}{"url":"..."}` — which is the
    // regression this suite guards.
    expect(toolCallArgEnds).toHaveLength(2)
    expect(byId(toolCallArgEnds, 'toolu_client_weather')).toMatchObject({
      toolCallId: 'toolu_client_weather',
      input: { location: 'Berlin' },
    })
    expect(byId(toolCallArgEnds, 'srvtoolu_web_fetch')).toMatchObject({
      toolCallId: 'srvtoolu_web_fetch',
      input: { url: 'https://example.com' },
    })

    // Run completes cleanly through the agent loop's follow-up turn.
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
  })
})

test.describe('anthropic — signed thinking replay (#910)', () => {
  test('keeps thinking blocks on the correct side of server tool calls', async ({
    request,
  }) => {
    const res = await request.post(
      '/api/anthropic-bug-test?case=thinking-order',
    )
    expect(res.ok()).toBe(true)
    const { chunks, error } = (await res.json()) as {
      chunks: Array<Record<string, unknown>>
      error: string | null
    }

    // The mounted Anthropic endpoint rejects the request unless the replayed
    // content blocks are thinking(A) → server tool/result → thinking(B) →
    // local tool. This mirrors Anthropic's signed-thinking validation.
    expect(error).toBeNull()
    expect(chunks.some((chunk) => chunk.type === 'RUN_FINISHED')).toBe(true)
  })
})
