/* eslint-disable @typescript-eslint/require-await -- fixed-response fetch mocks */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpritesClient } from '../src/client'

const enc = new TextEncoder()

/** Encode a `[type][payload]` binary exec frame as an ArrayBuffer. */
function frame(type: number, payload: string | Array<number>): ArrayBuffer {
  const body =
    typeof payload === 'string' ? [...enc.encode(payload)] : payload
  return new Uint8Array([type, ...body]).buffer
}

type Listener = (ev: unknown) => void

/**
 * Scriptable stub of the global WebSocket. Each instance records itself so a
 * test can drive open/message/close, and exposes the constructor args.
 */
class StubWebSocket {
  static last: StubWebSocket | undefined
  static instances: Array<StubWebSocket> = []
  url: string
  headers: Record<string, string> | undefined
  binaryType = 'blob'
  closed = false
  private listeners: Record<string, Array<Listener>> = {}

  constructor(url: string, opts?: { headers?: Record<string, string> }) {
    this.url = url
    this.headers = opts?.headers
    StubWebSocket.last = this
    StubWebSocket.instances.push(this)
  }

  addEventListener(type: string, fn: Listener): void {
    ;(this.listeners[type] ??= []).push(fn)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, ev: unknown = {}): void {
    for (const fn of this.listeners[type] ?? []) fn(ev)
  }

  open(): void {
    this.emit('open')
  }
  message(data: unknown): void {
    this.emit('message', { data })
  }
  fireClose(): void {
    this.emit('close', { code: 1000, reason: '' })
  }
}

let fetchMock: ReturnType<typeof vi.fn>
const fetchCalls: Array<{ url: string; method: string; body?: unknown }> = []

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  StubWebSocket.last = undefined
  StubWebSocket.instances = []
  fetchCalls.length = 0
  vi.stubGlobal('WebSocket', StubWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function client(): SpritesClient {
  return new SpritesClient({ apiKey: 'org/1/tid/secret', baseUrl: 'https://api.test' })
}

describe('SpritesClient.exec', () => {
  it('builds the ws URL + auth header and demuxes stdout/stderr/exit', async () => {
    const c = client()
    const proc = c.exec('sb', {
      argv: ['bash', '-c', 'echo hi'],
      cwd: '/work',
      env: { FOO: 'bar' },
    })
    const ws = StubWebSocket.last
    expect(ws).toBeDefined()
    const sock = ws as StubWebSocket
    const url = new URL(sock.url)
    expect(url.protocol).toBe('wss:')
    expect(url.pathname).toBe('/v1/sprites/sb/exec')
    expect(url.searchParams.getAll('cmd')).toEqual(['bash', '-c', 'echo hi'])
    expect(url.searchParams.get('dir')).toBe('/work')
    expect(url.searchParams.get('env')).toBe('FOO=bar')
    expect(sock.headers?.authorization).toBe('Bearer org/1/tid/secret')

    sock.open()
    sock.message(frame(1, 'out\n'))
    sock.message(frame(2, 'err\n'))
    sock.message(JSON.stringify({ type: 'exit', exit_code: 3 }))
    sock.message(frame(3, [3]))
    sock.fireClose()

    const read = async (s: AsyncIterable<string>) => {
      let t = ''
      for await (const c2 of s) t += c2
      return t
    }
    expect(await read(proc.stdout)).toBe('out\n')
    expect(await read(proc.stderr)).toBe('err\n')
    expect(await proc.wait()).toBe(3)
  })

  it('reads the exit code from a JSON-only exit frame', async () => {
    const c = client()
    const proc = c.exec('sb', { argv: ['true'] })
    const sock = StubWebSocket.last as StubWebSocket
    sock.open()
    sock.message(JSON.stringify({ type: 'exit', exit_code: 5 }))
    sock.fireClose()
    expect(await proc.wait()).toBe(5)
  })

  it('throws on abnormal close with no exit (no false exit 0)', async () => {
    const c = client()
    const proc = c.exec('sb', { argv: ['true'] })
    const sock = StubWebSocket.last as StubWebSocket
    sock.open()
    sock.message(frame(1, 'partial'))
    sock.fireClose()
    await expect(proc.wait()).rejects.toThrow(/before the process reported an exit/i)
  })

  it('kill() POSTs the kill endpoint with the session id, then wait() resolves 137', async () => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, method: init?.method ?? 'GET' })
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const c = client()
    const proc = c.exec('sb', { argv: ['sleep', '100'] })
    const sock = StubWebSocket.last as StubWebSocket
    sock.open()
    sock.message(JSON.stringify({ type: 'session_info', session_id: '906' }))

    const killed = proc.kill()
    // Fire close to release wait(); the kill path closed the socket.
    await Promise.resolve()
    sock.fireClose()
    await killed

    expect(
      fetchCalls.some(
        (c2) => c2.method === 'POST' && c2.url.endsWith('/exec/906/kill'),
      ),
    ).toBe(true)
    expect(sock.closed).toBe(true)
    expect(await proc.wait()).toBe(137)
  })

  it('aborting before session_info still kills via the kill endpoint', async () => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, method: init?.method ?? 'GET' })
      return new Response(null, { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const c = client()
    const proc = c.exec('sb', { argv: ['sleep', '100'], signal: controller.signal })
    const sock = StubWebSocket.last as StubWebSocket
    sock.open()
    // Abort BEFORE session_info arrives…
    controller.abort()
    await Promise.resolve()
    // …then the session id shows up and close fires.
    sock.message(JSON.stringify({ type: 'session_info', session_id: '42' }))
    sock.fireClose()
    await expect(proc.wait()).rejects.toThrow()
    // give the deferred kill a tick
    await new Promise((r) => setTimeout(r, 0))
    expect(
      fetchCalls.some((c2) => c2.url.endsWith('/exec/42/kill')),
    ).toBe(true)
  })
})

describe('SpritesClient.createCheckpoint', () => {
  it('returns the version created by THIS call, not the prior max', async () => {
    // before: [v1]; create stream mentions v2; after: [v1, v2]
    let listCount = 0
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url)
      const method = init?.method ?? 'GET'
      if (u.pathname.endsWith('/checkpoints') && method === 'GET') {
        listCount += 1
        const list =
          listCount === 1
            ? [{ id: 'Current', is_auto: false }, { id: 'v1', is_auto: false }]
            : [
                { id: 'Current', is_auto: false },
                { id: 'v1', is_auto: false },
                { id: 'v2', is_auto: false },
              ]
        return jsonResponse(list)
      }
      if (u.pathname.endsWith('/checkpoint') && method === 'POST') {
        return new Response('{"type":"info","data":"Checkpoint v2 created"}\n', {
          status: 200,
        })
      }
      return new Response('nope', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await client().createCheckpoint('sb', { comment: 'x' })).toBe('v2')
  })
})

describe('SpritesClient.fsRead', () => {
  it('throws on a missing file (404), per the SandboxFs contract', async () => {
    fetchMock = vi.fn(
      async () => new Response('{"error":"no such file"}', { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(client().fsRead('sb', '/nope')).rejects.toThrow(/failed: 404/)
  })

  it('returns bytes on success', async () => {
    fetchMock = vi.fn(async () => new Response('hello', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const bytes = await client().fsRead('sb', '/f')
    expect(new TextDecoder().decode(bytes)).toBe('hello')
  })
})

describe('SpritesClient lifecycle', () => {
  it('createSprite parses the resource; deleteSprite tolerates 404', async () => {
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'POST') {
        return jsonResponse(
          {
            id: 'sprite-1',
            name: 'sb',
            status: 'warm',
            url: 'https://sb-x.sprites.app',
            url_settings: { auth: 'public' },
          },
          201,
        )
      }
      return new Response(null, { status: 404 }) // DELETE of a missing sprite
    })
    vi.stubGlobal('fetch', fetchMock)

    const c = client()
    const sprite = await c.createSprite('sb')
    expect(sprite).toMatchObject({ name: 'sb', url: 'https://sb-x.sprites.app', urlAuth: 'public' })
    await expect(c.deleteSprite('gone')).resolves.toBeUndefined()
  })
})
