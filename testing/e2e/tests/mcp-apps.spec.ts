import { test, expect } from './fixtures'

/**
 * MCP Apps end-to-end — proves OUR plumbing for both planes, NOT any
 * third-party widget renderer.
 *
 *   - DATA plane (`api.mcp-apps-chat`): a `show_widget` MCP tool that links a
 *     `ui://show_widget` resource produces a `ui-resource` CUSTOM event on the
 *     stream. The event carries the resource HTML (token MCP_APPS_WIDGET_OK),
 *     which a client reconciles into a `UIResourcePart`. We assert the event
 *     reaches the client; we do NOT assert the iframe widget mounts.
 *   - INTERACTIVE plane (`api.mcp-apps-call`): a POST to the route mounting
 *     `createMcpAppCallHandler` returns the MCP tool's result (token
 *     MCP_APPS_CALL_OK).
 *   - ALLOWLIST: a call for a tool the server does not expose returns
 *     `{ ok: false }`.
 */

type StreamEvent = {
  type: string
  name?: string
  value?: unknown
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

test.describe('mcp-apps — data + interactive planes', () => {
  test('STATIC: a ui-linked MCP tool emits a ui-resource part over the stream', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const res = await request.post('/api/mcp-apps-chat', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-apps-thread-${testId}`,
        runId: `mcp-apps-run-${testId}`,
        state: {},
        messages: [
          {
            id: 'mcp-apps-msg-1',
            role: 'user',
            content: '[mcp-apps] show me the widget',
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
      `mcp-apps-chat route failed (${res.status()}): ${body}`,
    ).toBe(true)

    const events = parseSse(body)

    // The agentic loop must have invoked the ui-linked tool.
    const toolStart = events.find(
      (e) =>
        e.type === 'TOOL_CALL_START' &&
        ((e as { toolName?: string }).toolName === 'show_widget' ||
          (e as { toolCallName?: string }).toolCallName === 'show_widget'),
    )
    expect(toolStart, 'expected a TOOL_CALL_START for show_widget').toBeTruthy()

    // The data-plane assertion: a ui-resource CUSTOM event reached the client.
    // The HTML (MCP_APPS_WIDGET_OK) originates ONLY from the MCP server's
    // ui://show_widget resource, so finding it here proves the linked resource
    // was read and streamed (the read → CUSTOM event path).
    const uiResource = events.find(
      (e) => e.type === 'CUSTOM' && e.name === 'ui-resource',
    )
    expect(
      uiResource,
      'expected a ui-resource CUSTOM event on the stream',
    ).toBeTruthy()

    const value = uiResource?.value as
      | {
          resource?: { uri?: string; mimeType?: string; text?: string }
          serverId?: string
          toolCallId?: string
        }
      | undefined
    expect(value?.resource?.uri).toBe('ui://show_widget')
    expect(value?.resource?.mimeType).toBe('text/html')
    expect(value?.resource?.text ?? '').toContain('MCP_APPS_WIDGET_OK')
    expect(
      value?.toolCallId,
      'ui-resource must reference its tool call',
    ).toBeTruthy()

    // The run completed cleanly.
    expect(events.some((e) => e.type === 'RUN_ERROR')).toBe(false)
    expect(events.some((e) => e.type === 'RUN_FINISHED')).toBe(true)
  })

  test('INTERACTIVE: a POST to the call handler returns the MCP tool result', async ({
    request,
    testId,
  }) => {
    const res = await request.post('/api/mcp-apps-call', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-apps-thread-${testId}`,
        serverId: 'widgets',
        toolName: 'show_widget',
        args: { title: 'from-test' },
      },
    })

    const body = await res.text()
    expect(res.ok(), `mcp-apps-call failed (${res.status()}): ${body}`).toBe(
      true,
    )

    const json = JSON.parse(body) as {
      ok: boolean
      result?: unknown
      error?: string
    }
    expect(json.ok, `expected ok:true, got: ${body}`).toBe(true)
    // The result carries MCP_APPS_CALL_OK, which only the MCP server produces —
    // proving callTool actually executed against the in-process server.
    expect(JSON.stringify(json.result)).toContain('MCP_APPS_CALL_OK')
  })

  test('ALLOWLIST: a call for a tool the server does not expose returns ok:false', async ({
    request,
    testId,
  }) => {
    const res = await request.post('/api/mcp-apps-call', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-apps-thread-${testId}`,
        serverId: 'widgets',
        toolName: 'delete_everything',
        args: {},
      },
    })

    const body = await res.text()
    // The route returns the handler's JSON verbatim with a 200 status; the
    // rejection is in the body, not the HTTP status.
    expect(res.ok(), `mcp-apps-call failed (${res.status()}): ${body}`).toBe(
      true,
    )

    const json = JSON.parse(body) as { ok: boolean; error?: string }
    expect(json.ok, `expected ok:false for disallowed tool, got: ${body}`).toBe(
      false,
    )
    expect(
      json.error,
      `expected error message to mention 'not allowed', got: ${body}`,
    ).toContain('not allowed')
  })
})
