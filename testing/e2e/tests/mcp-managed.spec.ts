import { test, expect } from './fixtures'

/**
 * MCP tool discovery + execution managed by `chat({ mcp })`.
 *
 * Proves that passing `mcp: { clients, connection: 'close' }` to `chat()` is
 * sufficient to:
 *   1. Auto-discover tools from the MCP client (no manual `mcp.tools()` call).
 *   2. Execute the discovered tool (`get_guitar_price`) inside the agent loop.
 *   3. Close the MCP client after the stream drains (no manual `mcp.close()`).
 *
 * The route under test (`api.mcp-managed-test`) does NOT call `mcp.tools()` or
 * `mcp.close()` — it delegates both to `chat({ mcp })`. Compare with
 * `api.mcp-test`, which manually calls `mcp.tools()` and wraps the stream in a
 * `closeMcpOnDrain` generator.
 *
 * Same fixture as the basic MCP test (`fixtures/mcp/basic.json`). Each test
 * gets a unique `testId` so `sequenceIndex` is isolated between the two specs.
 */

type StreamEvent = {
  type: string
  toolName?: string
  toolCallName?: string
  toolCallId?: string
  result?: unknown
  content?: unknown
  delta?: string
}

function parseSse(body: string): Array<StreamEvent> {
  const events: Array<StreamEvent> = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const json = trimmed.slice('data:'.length).trim()
    if (!json) continue
    try {
      events.push(JSON.parse(json) as StreamEvent)
    } catch {
      // Ignore non-JSON keepalive lines.
    }
  }
  return events
}

test.describe('mcp-managed — chat({ mcp }) discovery + lifecycle', () => {
  test('chat({ mcp }) discovers get_guitar_price and the result reaches the transcript', async ({
    request,
    testId,
    aimockPort,
  }) => {
    // Minimal valid AG-UI RunAgentInput body — identical message to the basic
    // MCP spec so the same aimock fixture (`fixtures/mcp/basic.json`) is used.
    // Unique testId ensures sequenceIndex isolation from the other spec.
    const res = await request.post('/api/mcp-managed-test', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-managed-thread-${testId}`,
        runId: `mcp-managed-run-${testId}`,
        state: {},
        messages: [
          {
            id: 'mcp-managed-msg-1',
            role: 'user',
            content: '[mcp] how much is the strat guitar',
          },
        ],
        tools: [],
        context: [],
        forwardedProps: { testId, aimockPort },
      },
    })

    const body = await res.text()
    expect(
      res.ok(),
      `mcp-managed-test route failed (${res.status()}): ${body}`,
    ).toBe(true)

    const events = parseSse(body)

    // The agentic loop must have invoked the MCP tool via chat({ mcp }) discovery.
    const toolStart = events.find(
      (e) =>
        e.type === 'TOOL_CALL_START' &&
        (e.toolName === 'get_guitar_price' ||
          e.toolCallName === 'get_guitar_price'),
    )
    expect(
      toolStart,
      'expected a TOOL_CALL_START for get_guitar_price',
    ).toBeTruthy()

    // The MCP tool result is emitted as the AG-UI TOOL_CALL_RESULT event. The
    // price 1999 originates ONLY from the real MCP server (the fixture's
    // tool-call args don't contain it), so finding it here proves the MCP tool
    // actually executed against the in-process server via chat({ mcp }).
    const toolResult = events.find((e) => e.type === 'TOOL_CALL_RESULT')
    expect(toolResult, 'expected a TOOL_CALL_RESULT event').toBeTruthy()
    const resultStr = JSON.stringify(toolResult?.content ?? '')
    expect(resultStr).toContain('1999')
    expect(resultStr).toContain('strat')

    // The final assistant text (post tool execution) must contain the price too.
    const finalText = events
      .filter((e) => e.type === 'TEXT_MESSAGE_CONTENT' && e.delta)
      .map((e) => e.delta)
      .join('')
    expect(finalText).toContain('1999')

    // The run completed cleanly (no RUN_ERROR).
    expect(events.some((e) => e.type === 'RUN_ERROR')).toBe(false)
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true)
  })
})
