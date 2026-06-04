import { test, expect } from './fixtures'

/**
 * MCP server tool discovery + execution inside chat().
 *
 * Proves the `@tanstack/ai-mcp` package end-to-end against the real E2E
 * harness:
 *   - `api.mcp-server` hosts a real in-process MCP server (Streamable HTTP)
 *     exposing one deterministic tool `get_guitar_price` ({ id } → { id,
 *     price: 1999 }).
 *   - `api.mcp-test` connects to it via `createMCPClient`, discovers the tool
 *     with `mcp.tools()`, and runs it inside a real `chat()` agent loop with
 *     the LLM mocked by aimock.
 *   - The aimock fixture (`fixtures/mcp/basic.json`) makes the model emit a
 *     `get_guitar_price` tool call then a final answer.
 *
 * The MCP server is the *only* source of the price `1999`: the fixture's
 * tool-call arguments don't contain it. So asserting `1999` reaches the
 * streamed `TOOL_CALL_END.result` proves the MCP tool actually executed.
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

test.describe('mcp — server tool discovery + execution in chat()', () => {
  test('discovers get_guitar_price from the MCP server and the result reaches the transcript', async ({
    request,
    testId,
    aimockPort,
  }) => {
    // Minimal valid AG-UI RunAgentInput body (the route parses it via
    // chatParamsFromRequestBody).
    const res = await request.post('/api/mcp-test', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-thread-${testId}`,
        runId: `mcp-run-${testId}`,
        state: {},
        messages: [
          {
            id: 'mcp-msg-1',
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
    expect(res.ok(), `mcp-test route failed (${res.status()}): ${body}`).toBe(
      true,
    )

    const events = parseSse(body)

    // The agentic loop must have invoked the MCP tool.
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
    // actually executed against the in-process server.
    const toolResult = events.find((e) => e.type === 'TOOL_CALL_RESULT')
    expect(toolResult, 'expected a TOOL_CALL_RESULT event').toBeTruthy()
    const resultStr = JSON.stringify(toolResult?.content ?? '')
    expect(resultStr).toContain('1999')
    expect(resultStr).toContain('strat')

    // And the final assistant text (post tool execution) streamed through.
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
