import { PROTOCOL_VERSION_META_KEY } from '@modelcontextprotocol/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serveMCPStdio } from '../../src/server/stdio'

// stdio.test.ts runs serveMCPStdio in a child process. This file runs it
// in-process against a fake transport so the bridge logic is measured.
const fake = vi.hoisted(() => {
  class FakeTransport {
    sent: Array<unknown> = []
    closed = false
    onmessage?: (message: unknown) => void
    onerror?: (error: Error) => void
    constructor() {
      fake.transports.push(this)
    }
    start() {
      return fake.startError
        ? Promise.reject(fake.startError)
        : Promise.resolve()
    }
    send(message: unknown) {
      if (fake.failSend) return Promise.reject(new Error('send failed'))
      this.sent.push(message)
      return Promise.resolve()
    }
    close() {
      this.closed = true
      return Promise.resolve()
    }
  }
  return {
    FakeTransport,
    transports: [] as Array<InstanceType<typeof FakeTransport>>,
    startError: undefined as Error | undefined,
    failSend: false,
  }
})

vi.mock('@modelcontextprotocol/server/stdio', () => ({
  StdioServerTransport: fake.FakeTransport,
}))

type Fetch = (request: Request) => Promise<Response>

const handles: Array<{ close: () => Promise<void> }> = []
let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  fake.failSend = false
  fake.startError = undefined
  await Promise.all(handles.splice(0).map((handle) => handle.close()))
  fake.transports.length = 0
  errors.mockRestore()
})

function serve(fetch: Fetch) {
  const requests: Array<Request> = []
  const handle = serveMCPStdio({
    fetch: (req) => {
      requests.push(req)
      return fetch(req)
    },
  })
  handles.push(handle)
  const transport = fake.transports.at(-1)!
  return {
    handle,
    transport,
    requests,
    receive: (message: unknown) => transport.onmessage!(message),
  }
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
}

function request(id: number, method: string, params?: unknown) {
  return { jsonrpc: '2.0', id, method, params }
}

function result(id: number, value: unknown = {}) {
  return { jsonrpc: '2.0', id, result: value }
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

function sseStream(chunks: Array<string>) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('serveMCPStdio in-process', () => {
  it('forwards a request and writes the JSON answer', async () => {
    const { transport, requests, receive } = serve(async () =>
      json(result(1, { ok: true })),
    )
    receive(request(1, 'tools/list'))

    await vi.waitFor(() =>
      expect(transport.sent).toEqual([result(1, { ok: true })]),
    )
    const [sent] = requests
    expect(sent?.method).toBe('POST')
    expect(sent?.headers.get('accept')).toBe(
      'application/json, text/event-stream',
    )
    expect(sent?.headers.get('content-type')).toBe('application/json')
    expect(await sent?.json()).toEqual(request(1, 'tools/list'))
  })

  it('keeps the session id but does not send it on initialize', async () => {
    const { transport, requests, receive } = serve(async (req) => {
      const body = await req.json()
      return json(result(body.id), { headers: { 'mcp-session-id': 'abc' } })
    })
    receive(request(1, 'tools/list'))
    await vi.waitFor(() => expect(transport.sent).toHaveLength(1))
    receive(request(2, 'tools/list'))
    receive(request(3, 'initialize'))
    await vi.waitFor(() => expect(transport.sent).toHaveLength(3))

    expect(requests.map((r) => r.headers.get('mcp-session-id'))).toEqual([
      null,
      'abc',
      null,
    ])
  })

  it('writes every message of a JSON batch', async () => {
    const { transport, receive } = serve(async () =>
      json([result(1), result(2)]),
    )
    receive(request(1, 'tools/list'))

    await vi.waitFor(() =>
      expect(transport.sent).toEqual([result(1), result(2)]),
    )
  })

  it('parses an event-stream answer', async () => {
    const body = [
      ': comment',
      'event: message',
      `data: ${JSON.stringify(result(1, { a: 1 }))}`,
      '',
      'data:',
      '',
      `data:${JSON.stringify(result(2))}`,
      '',
    ].join('\r\n')
    const { transport, receive } = serve(
      async () =>
        new Response(body, {
          headers: { 'content-type': 'Text/Event-Stream; charset=utf-8' },
        }),
    )
    receive(request(1, 'tools/list'))

    await vi.waitFor(() =>
      expect(transport.sent).toEqual([result(1, { a: 1 }), result(2)]),
    )
  })

  it('treats a body that starts with data: as an event stream', async () => {
    const { transport, receive } = serve(
      async () => new Response(`data: ${JSON.stringify(result(1))}`),
    )
    receive(request(1, 'tools/list'))

    await vi.waitFor(() => expect(transport.sent).toEqual([result(1)]))
  })

  it('writes nothing for an empty ok answer', async () => {
    const { transport, requests, receive } = serve(
      async () => new Response(null, { status: 202 }),
    )
    receive({ jsonrpc: '2.0', method: 'notifications/initialized' })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    await settle()

    expect(transport.sent).toEqual([])
  })

  it('answers the request when the server returns an empty error', async () => {
    const { transport, receive } = serve(
      async () => new Response(null, { status: 401 }),
    )
    receive(request(7, 'tools/list'))

    await vi.waitFor(() =>
      expect(transport.sent).toEqual([
        {
          jsonrpc: '2.0',
          id: 7,
          error: { code: -32603, message: 'The MCP server answered HTTP 401.' },
        },
      ]),
    )
  })

  it('answers the request when the error body is not JSON-RPC', async () => {
    const { transport, receive } = serve(async () =>
      json({ error: 'invalid_token' }, { status: 401 }),
    )
    receive(request(7, 'tools/list'))

    await vi.waitFor(() =>
      expect(transport.sent).toEqual([
        {
          jsonrpc: '2.0',
          id: 7,
          error: { code: -32603, message: 'The MCP server answered HTTP 401.' },
        },
      ]),
    )
  })

  it('forwards a JSON-RPC error body from a failed response', async () => {
    const error = { jsonrpc: '2.0', id: 7, error: { code: -1, message: 'no' } }
    const { transport, receive } = serve(async () =>
      json(error, { status: 404 }),
    )
    receive(request(7, 'tools/list'))

    await vi.waitFor(() => expect(transport.sent).toEqual([error]))
  })

  it('answers with an internal error when the ok body is not JSON', async () => {
    const { transport, receive } = serve(async () => new Response('{nope'))
    receive(request(3, 'tools/list'))

    await vi.waitFor(() =>
      expect(transport.sent).toEqual([
        {
          jsonrpc: '2.0',
          id: 3,
          error: { code: -32603, message: 'Internal server error' },
        },
      ]),
    )
    expect(errors).toHaveBeenCalled()
  })

  it('logs a thrown fetch error and answers the request', async () => {
    const { transport, receive } = serve(async () => {
      throw new Error('boom')
    })
    receive(request(4, 'tools/list'))

    await vi.waitFor(() => expect(transport.sent).toHaveLength(1))
    expect(errors).toHaveBeenCalledWith('boom')
  })

  it('logs a generic text for a non-Error failure and skips notifications', async () => {
    const { transport, requests, receive } = serve(() => Promise.reject('bad'))
    receive({ jsonrpc: '2.0', method: 'notifications/cancelled' })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    await settle()

    expect(errors).toHaveBeenCalledWith('The stdio server failed to answer.')
    expect(transport.sent).toEqual([])
  })

  it('logs when even the failure answer cannot be written', async () => {
    fake.failSend = true
    const { requests, receive } = serve(async () => json(result(1)))
    receive(request(1, 'tools/list'))
    receive({ jsonrpc: '2.0', id: 9, result: {} })
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    await settle()

    expect(errors).toHaveBeenCalledWith('send failed')
  })

  it('does not hold a notification behind a running request', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => (release = resolve))
    const { transport, requests, receive } = serve(async (req) => {
      const body = await req.json()
      if (body.id === 1) await blocked
      return 'id' in body ? json(result(body.id)) : new Response(null)
    })
    receive(request(1, 'tools/call'))
    receive({ jsonrpc: '2.0', method: 'notifications/cancelled' })

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(transport.sent).toEqual([])
    release()
    await vi.waitFor(() => expect(transport.sent).toEqual([result(1)]))
  })

  it('mirrors the spec 2026 envelope into headers', async () => {
    const { transport, requests, receive } = serve(async (req) => {
      const body = await req.json()
      return json(result(body.id))
    })
    const meta = { _meta: { [PROTOCOL_VERSION_META_KEY]: '2026-07-28' } }
    const names = [
      ['tools/call', { ...meta, name: 'weather' }],
      ['prompts/get', { ...meta, name: 'héllo' }],
      ['resources/read', { ...meta, uri: ' file://a' }],
      ['tools/call', { ...meta, name: '' }],
      ['tools/call', { ...meta, name: '=?base64?x?=' }],
      ['tools/call', { ...meta, name: 'a\tb' }],
      ['tools/call', { ...meta, name: 42 }],
      ['resources/read', { ...meta, uri: 42 }],
      ['tools/list', meta],
    ] as const
    names.forEach(([method, params], index) =>
      receive(request(index + 1, method, params)),
    )
    await vi.waitFor(() => expect(transport.sent).toHaveLength(names.length))

    expect(requests.map((r) => r.headers.get('mcp-method'))).toEqual(
      names.map(([method]) => method),
    )
    expect(requests.map((r) => r.headers.get('mcp-protocol-version'))).toEqual(
      names.map(() => '2026-07-28'),
    )
    expect(requests.map((r) => r.headers.get('mcp-name'))).toEqual([
      'weather',
      '=?base64?aMOpbGxv?=',
      '=?base64?IGZpbGU6Ly9h?=',
      '=?base64??=',
      '=?base64?PT9iYXNlNjQ/eD89?=',
      'a\tb',
      null,
      null,
      null,
    ])
  })

  it('ignores an envelope without a usable version', async () => {
    const { transport, requests, receive } = serve(async (req) => {
      const body = await req.json()
      return json(result(body.id))
    })
    receive(request(1, 'tools/call', { _meta: 'x', name: 'a' }))
    receive(
      request(2, 'tools/call', { _meta: { [PROTOCOL_VERSION_META_KEY]: 1 } }),
    )
    receive(request(3, 'tools/call', ['not', 'a', 'record']))
    await vi.waitFor(() => expect(transport.sent).toHaveLength(3))

    expect(requests.map((r) => r.headers.get('mcp-method'))).toEqual([
      null,
      null,
      null,
    ])
  })

  describe('spec 2025 session', () => {
    const legacyInit = (req: Request) =>
      req.method === 'GET'
        ? undefined
        : json(result(1, { protocolVersion: '2025-06-18' }), {
            headers: { 'mcp-session-id': 's1' },
          })

    it('opens the GET stream and relays its messages', async () => {
      const pushed = { jsonrpc: '2.0', method: 'notifications/message' }
      const { transport, requests, receive } = serve(async (req) => {
        if (req.method === 'GET') {
          const text = `data: ${JSON.stringify(pushed)}\n\n`
          return new Response(
            sseStream([text.slice(0, 10), text.slice(10), 'data: {"x"']),
          )
        }
        return legacyInit(req)!
      })
      receive(request(1, 'initialize'))

      await vi.waitFor(() =>
        expect(transport.sent).toEqual([
          result(1, { protocolVersion: '2025-06-18' }),
          pushed,
        ]),
      )
      const get = requests.find((r) => r.method === 'GET')
      expect(get?.headers.get('accept')).toBe('text/event-stream')
      expect(get?.headers.get('mcp-session-id')).toBe('s1')
      expect(get?.headers.get('mcp-protocol-version')).toBe('2025-06-18')
    })

    it('resends the 2025 version on later messages', async () => {
      const { transport, requests, receive } = serve(async (req) => {
        if (req.method === 'GET') return new Response(sseStream([]))
        const body = await req.json()
        return body.id === 1 ? legacyInit(req)! : json(result(body.id))
      })
      receive(request(1, 'initialize'))
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1))
      receive(request(2, 'tools/list'))
      receive(
        request(3, 'tools/list', {
          _meta: { [PROTOCOL_VERSION_META_KEY]: '2026-07-28' },
        }),
      )
      await vi.waitFor(() => expect(transport.sent).toHaveLength(3))

      const posts = requests.filter((r) => r.method === 'POST')
      expect(posts[1]?.headers.get('mcp-protocol-version')).toBe('2025-06-18')
      expect(posts[1]?.headers.get('mcp-session-id')).toBe('s1')
      expect(posts[2]?.headers.get('mcp-protocol-version')).toBe('2026-07-28')
    })

    it('learns the 2025 version from a response header', async () => {
      const { transport, requests, receive } = serve(async (req) => {
        if (req.method === 'GET') return new Response(sseStream([]))
        const body = await req.json()
        return json(result(body.id), {
          headers: {
            'mcp-session-id': 's2',
            'mcp-protocol-version': body.id === 1 ? '2026-07-28' : '2025-03-26',
          },
        })
      })
      receive(request(1, 'tools/list'))
      await vi.waitFor(() => expect(transport.sent).toHaveLength(1))
      expect(requests.some((r) => r.method === 'GET')).toBe(false)

      receive(request(2, 'tools/list'))
      await vi.waitFor(() =>
        expect(requests.find((r) => r.method === 'GET')).toBeDefined(),
      )
      expect(
        requests
          .find((r) => r.method === 'GET')
          ?.headers.get('mcp-protocol-version'),
      ).toBe('2025-03-26')
    })

    it('logs a failed stream and opens it again on the next message', async () => {
      let gets = 0
      const { transport, requests, receive } = serve(async (req) => {
        if (req.method === 'GET') {
          gets += 1
          if (gets === 1) return new Response(null, { status: 500 })
          if (gets === 2) return new Response(null, { status: 200 })
          throw new Error('stream down')
        }
        const body = await req.json()
        return body.id === 1 ? legacyInit(req)! : json(result(body.id))
      })
      for (const id of [1, 2, 3]) {
        receive(request(id, id === 1 ? 'initialize' : 'tools/list'))
        await vi.waitFor(() => expect(transport.sent).toHaveLength(id))
      }

      expect(requests.filter((r) => r.method === 'GET')).toHaveLength(3)
      expect(errors).toHaveBeenCalledWith('MCP stdio legacy stream failed: 500')
      expect(errors).toHaveBeenCalledWith('MCP stdio legacy stream failed: 200')
      expect(errors).toHaveBeenCalledWith('stream down')
    })

    it('logs a stream that breaks while reading', async () => {
      const { transport, receive } = serve(async (req) => {
        if (req.method === 'GET') {
          return new Response(
            new ReadableStream({
              pull(controller) {
                controller.error(new Error('read broke'))
              },
            }),
          )
        }
        return legacyInit(req)!
      })
      receive(request(1, 'initialize'))

      await vi.waitFor(() => expect(errors).toHaveBeenCalledWith('read broke'))
      expect(transport.sent).toHaveLength(1)
    })
  })

  describe('close', () => {
    it('aborts in-flight work, closes the transport, and is idempotent', async () => {
      const { handle, transport, requests, receive } = serve(
        (req) =>
          new Promise((_, reject) => {
            req.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            )
          }),
      )
      receive(request(1, 'tools/call'))
      await vi.waitFor(() => expect(requests).toHaveLength(1))

      await handle.close()
      await handle.close()

      expect(requests[0]?.signal.aborted).toBe(true)
      expect(transport.closed).toBe(true)
      expect(transport.sent).toEqual([])
      expect(errors).not.toHaveBeenCalled()

      receive({ jsonrpc: '2.0', method: 'notifications/cancelled' })
      await settle()
      expect(requests).toHaveLength(1)
    })

    it('drops an answer that arrives after close', async () => {
      let release!: () => void
      const blocked = new Promise<void>((resolve) => (release = resolve))
      const { handle, transport, requests, receive } = serve(async () => {
        await blocked
        return json(result(1))
      })
      receive(request(1, 'tools/call'))
      await vi.waitFor(() => expect(requests).toHaveLength(1))

      const closing = handle.close()
      release()
      await closing

      expect(transport.sent).toEqual([])
    })

    it('stops the GET stream without logging', async () => {
      const { handle, transport, requests, receive } = serve(async (req) => {
        if (req.method === 'GET') {
          return new Response(
            new ReadableStream({
              start(controller) {
                req.signal.addEventListener('abort', () =>
                  controller.error(new Error('aborted')),
                )
              },
            }),
          )
        }
        return json(result(1, { protocolVersion: '2025-06-18' }), {
          headers: { 'mcp-session-id': 's1' },
        })
      })
      receive(request(1, 'initialize'))
      await vi.waitFor(() =>
        expect(requests.find((r) => r.method === 'GET')).toBeDefined(),
      )

      await handle.close()
      await settle()

      expect(transport.closed).toBe(true)
      expect(errors).not.toHaveBeenCalled()
    })

    it('closes when stdin ends', async () => {
      const { transport } = serve(async () => json(result(1)))
      process.stdin.emit('end')

      await vi.waitFor(() => expect(transport.closed).toBe(true))
    })
  })

  it('logs a failed start and still closes', async () => {
    fake.startError = new Error('no stdin')
    const { handle, transport } = serve(async () => json(result(1)))

    await handle.close()

    expect(errors).toHaveBeenCalledWith('no stdin')
    expect(transport.closed).toBe(true)
  })

  it('logs transport errors', () => {
    const { transport } = serve(async () => json(result(1)))
    transport.onerror!(new Error('bad frame'))

    expect(errors).toHaveBeenCalledWith('bad frame')
  })
})
