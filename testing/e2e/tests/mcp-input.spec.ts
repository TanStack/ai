import { test, expect } from './fixtures'

/**
 * An MCP tool that asks for input pauses chat(), and the answer resumes it.
 *
 *   - `api.mcp-input-server` is a spec 2026 server from `createMCPServer`.
 *     Its `ask_city` tool calls `ctx.context.requestInput`.
 *   - `api.mcp-input-test` runs chat() with that tool. aimock makes the model
 *     call `ask_city`, then answer after the tool result.
 *
 * The city `Paris` comes only from the resume payload, so seeing it in the
 * tool result proves that the answer reached the MCP server.
 */

type StreamEvent = {
  type: string
  toolCallId?: string
  toolCallName?: string
  content?: unknown
  delta?: string
  outcome?: {
    type: string
    interrupts?: Array<{
      id: string
      reason: string
      metadata?: Record<string, unknown>
    }>
  }
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

const question = '[mcp-input] what is the forecast'

test.describe('mcp input: pause and resume chat()', () => {
  test('pauses on requestInput, then the answer reaches the tool', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `mcp-input-thread-${testId}`
    const firstRunId = `mcp-input-run-${testId}`

    const first = await request.post('/api/mcp-input-test', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId,
        runId: firstRunId,
        state: {},
        messages: [{ id: 'mcp-input-msg-1', role: 'user', content: question }],
        tools: [],
        context: [],
        forwardedProps: { testId, aimockPort },
      },
    })
    const firstBody = await first.text()
    expect(first.ok(), `first run failed: ${firstBody}`).toBe(true)
    const firstEvents = parseSse(firstBody)

    const toolStart = firstEvents.find(
      (event) =>
        event.type === 'TOOL_CALL_START' && event.toolCallName === 'ask_city',
    )
    const toolCallId = toolStart?.toolCallId
    expect(toolCallId, 'expected an ask_city tool call').toBeTruthy()

    const finished = firstEvents.find((event) => event.type === 'RUN_FINISHED')
    expect(finished?.outcome?.type, firstBody).toBe('interrupt')
    const interrupt = finished?.outcome?.interrupts?.[0]
    expect(interrupt).toMatchObject({
      id: `mcp_input_${toolCallId}`,
      reason: 'mcp_input',
    })
    expect(interrupt?.metadata?.['tanstack:interruptBinding']).toMatchObject({
      kind: 'generic',
      interruptedRunId: firstRunId,
    })
    expect(firstEvents.some((event) => event.type === 'TOOL_CALL_RESULT')).toBe(
      false,
    )

    const second = await request.post('/api/mcp-input-test', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId,
        runId: `mcp-input-run-2-${testId}`,
        parentRunId: firstRunId,
        resume: [
          {
            interruptId: `mcp_input_${toolCallId}`,
            status: 'resolved',
            payload: { value: 'Paris' },
          },
        ],
        state: {},
        messages: [
          { id: 'mcp-input-msg-1', role: 'user', content: question },
          {
            id: 'mcp-input-msg-2',
            role: 'assistant',
            content: 'Let me ask for the city.',
            toolCalls: [
              {
                id: toolCallId,
                type: 'function',
                function: { name: 'ask_city', arguments: '{}' },
              },
            ],
          },
        ],
        tools: [],
        context: [],
        forwardedProps: { testId, aimockPort },
      },
    })
    const secondBody = await second.text()
    expect(second.ok(), `resume run failed: ${secondBody}`).toBe(true)
    const secondEvents = parseSse(secondBody)

    expect(secondEvents.some((event) => event.type === 'RUN_ERROR')).toBe(false)
    const toolResult = secondEvents.find(
      (event) => event.type === 'TOOL_CALL_RESULT',
    )
    expect(JSON.stringify(toolResult?.content ?? '')).toContain(
      'Forecast for Paris: sunny',
    )
    const finalText = secondEvents
      .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT' && event.delta)
      .map((event) => event.delta)
      .join('')
    expect(finalText).toContain('sunny')
  })
})
