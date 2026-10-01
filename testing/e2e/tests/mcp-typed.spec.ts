import { test, expect } from './fixtures'

/**
 * A `createMCPServer` server with auth, a string output schema, and a task.
 *
 *   - `api.mcp-typed-server` accepts the tokens `alice` and `bob`. Each token
 *     is its own subject.
 *   - `api.mcp-typed-test` connects with a token and runs chat(). aimock
 *     makes the model call `forecast` and `build_report`.
 */

type StreamEvent = {
  type: string
  toolCallId?: string
  toolCallName?: string
  content?: unknown
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

function resultFor(events: Array<StreamEvent>, toolName: string) {
  const start = events.find(
    (event) =>
      event.type === 'TOOL_CALL_START' && event.toolCallName === toolName,
  )
  const result = events.find(
    (event) =>
      event.type === 'TOOL_CALL_RESULT' &&
      event.toolCallId === start?.toolCallId,
  )
  return JSON.stringify(result?.content ?? '')
}

function mcpPost(token: string | undefined, body: unknown, sessionId?: string) {
  return {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(sessionId === undefined
        ? {}
        : {
            'mcp-session-id': sessionId,
            'mcp-protocol-version': '2025-11-25',
          }),
    },
    data: body,
  }
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '1.0.0' },
  },
}

const toolsList = { jsonrpc: '2.0', id: 2, method: 'tools/list' }

// A spec 2025 request with no session id, as a stateless client sends it.
function legacyPost(body: unknown) {
  return {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
    },
    data: body,
  }
}

// The body is JSON or one SSE message, depending on the transport.
function rpcResult(body: string): any {
  const data = body
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice('data:'.length)
  return JSON.parse(data ?? body).result
}

test.describe('mcp: createMCPServer with auth, output schema, and a task', () => {
  test('a client typed from the server discovers and calls its tools over HTTP', async ({
    request,
  }) => {
    const res = await request.get('/api/mcp-typed-test')
    const body = await res.text()
    expect(res.ok(), body).toBe(true)
    const result = JSON.parse(body) as {
      tools: Array<{ name: string; outputSchema: { type?: string } | null }>
      forecast: unknown
      brief: unknown
    }

    const forecast = result.tools.find((tool) => tool.name === 'forecast')
    expect(forecast?.outputSchema?.type).toBe('string')
    expect(result.tools.map((tool) => tool.name)).toContain('build_report')
    expect(result.forecast).toBe('Sunny in Paris')
    expect(result.brief).toEqual([
      {
        role: 'user',
        content: { type: 'text', text: 'Plan one day in Paris.' },
      },
    ])
  })

  test('chat() runs the typed tool and the task tool with a bearer token', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const res = await request.post('/api/mcp-typed-test', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        threadId: `mcp-typed-thread-${testId}`,
        runId: `mcp-typed-run-${testId}`,
        state: {},
        messages: [
          {
            id: 'mcp-typed-msg-1',
            role: 'user',
            content: '[mcp-typed] forecast and report',
          },
        ],
        tools: [],
        context: [],
        forwardedProps: { testId, aimockPort, token: 'alice' },
      },
    })
    const body = await res.text()
    expect(res.ok(), body).toBe(true)
    const events = parseSse(body)

    expect(
      events.some((event) => event.type === 'RUN_ERROR'),
      body,
    ).toBe(false)
    expect(resultFor(events, 'forecast')).toContain('Sunny in Paris')
    // Spec 2026 has no tasks, so the task tool runs inline on this call.
    expect(resultFor(events, 'build_report')).toContain('Report ready')
  })

  test('a request without a token gets 401', async ({ request }) => {
    const res = await request.post(
      '/api/mcp-typed-server',
      mcpPost(undefined, initialize),
    )
    expect(res.status()).toBe(401)
  })

  test('a spec 2025 session belongs to the token that opened it', async ({
    request,
  }) => {
    const opened = await request.post(
      '/api/mcp-typed-server',
      mcpPost('alice', initialize),
    )
    expect(opened.ok(), await opened.text()).toBe(true)
    const sessionId = opened.headers()['mcp-session-id']
    expect(sessionId, 'expected a session id').toBeTruthy()

    const own = await request.post(
      '/api/mcp-typed-server',
      mcpPost('alice', toolsList, sessionId),
    )
    expect(own.status()).toBe(200)

    const other = await request.post(
      '/api/mcp-typed-server',
      mcpPost('bob', toolsList, sessionId),
    )
    expect(other.status()).toBe(404)
  })

  test('a stateless server serves spec 2025 with resource context and tool _meta', async ({
    request,
  }) => {
    const url = '/api/mcp-typed-server?stateless'
    const opened = await request.post(url, legacyPost(initialize))
    expect(opened.ok(), await opened.text()).toBe(true)
    expect(opened.headers()['mcp-session-id']).toBeUndefined()

    const read = await request.post(
      url,
      legacyPost({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/read',
        params: { uri: 'notes://7' },
      }),
    )
    expect(rpcResult(await read.text()).contents[0].text).toBe(
      'note 7 for acme',
    )

    const listed = await request.post(
      url,
      legacyPost({ jsonrpc: '2.0', id: 4, method: 'resources/list' }),
    )
    expect(rpcResult(await listed.text()).resources).toContainEqual(
      expect.objectContaining({ uri: 'notes://1', name: 'Note 1 for acme' }),
    )

    const tools = await request.post(url, legacyPost(toolsList))
    expect(rpcResult(await tools.text()).tools[0]._meta).toMatchObject({
      ui: { resourceUri: 'ui://notes/view' },
    })
  })
})
