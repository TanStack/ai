import { describe, expect, it } from 'vitest'
import { webSocket } from '../src/connection-adapters'

// Minimal fake WebSocket (constructor-compatible with the WHATWG shape).
class FakeWebSocket {
  static instances: Array<FakeWebSocket> = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  sent: Array<string> = []
  readyState = 0
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.readyState = 3
    this.onclose?.()
  }
  emit(chunk: unknown, id?: string): void {
    this.onmessage?.({
      data: JSON.stringify(id === undefined ? chunk : { id, chunk }),
    })
  }
}

function drain(
  iter: AsyncIterable<any>,
  sink: Array<any>,
  signal: AbortSignal,
): Promise<void> {
  return (async () => {
    for await (const c of iter) {
      if (signal.aborted) break
      sink.push(c)
    }
  })()
}

describe('webSocket() subscribe/send', () => {
  it('sends a RunAgentInput frame and yields inbound chunks', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })
    const ac = new AbortController()
    const received: Array<any> = []
    const sub = drain(conn.subscribe(ac.signal), received, ac.signal)
    await conn.send([{ role: 'user', content: 'hi' } as any], undefined, ac.signal, {
      threadId: 't',
      runId: 'r',
    })
    const ws = FakeWebSocket.instances[0]
    if (!ws) throw new Error('expected a FakeWebSocket instance to have been created')
    await new Promise((r) => setTimeout(r, 0))
    expect(ws.sent.length).toBe(1)
    const sentFrame = ws.sent[0]
    if (!sentFrame) throw new Error('expected a sent frame')
    expect(JSON.parse(sentFrame).runId).toBe('r')

    ws.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'a', timestamp: 0 }, 'off-1')
    ws.emit({ type: 'ping' }) // must be ignored
    await new Promise((r) => setTimeout(r, 0))
    ac.abort()
    await sub
    expect(received.map((c) => c.type)).toEqual(['TEXT_MESSAGE_CONTENT'])
  })

  it('delivers a bare chunk (no id envelope) as-is to subscribe()', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })
    const ac = new AbortController()
    const received: Array<any> = []
    const sub = drain(conn.subscribe(ac.signal), received, ac.signal)
    await conn.send([{ role: 'user', content: 'hi' } as any], undefined, ac.signal, {
      threadId: 't',
      runId: 'r',
    })
    const ws = FakeWebSocket.instances[0]
    if (!ws) throw new Error('expected a FakeWebSocket instance to have been created')
    await new Promise((r) => setTimeout(r, 0))

    // Bare chunk (no id) — not wrapped in an {id, chunk} envelope.
    ws.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'x', timestamp: 0 })
    await new Promise((r) => setTimeout(r, 0))
    ac.abort()
    await sub
    expect(received.map((c) => c.type)).toEqual(['TEXT_MESSAGE_CONTENT'])
    expect(received[0].delta).toBe('x')
  })

  it('joinRun opens a socket with offset=-1 and runId, and yields emitted chunks', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })
    const ac = new AbortController()
    const received: Array<any> = []
    const sub = drain(conn.joinRun('run-j', ac.signal), received, ac.signal)
    await new Promise((r) => setTimeout(r, 0))

    const ws = FakeWebSocket.instances[0]
    if (!ws) throw new Error('expected a FakeWebSocket instance to have been created')
    expect(ws.url).toContain('offset=-1')
    expect(ws.url).toContain('runId=run-j')

    ws.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'joined', timestamp: 0 }, 'off-1')
    await new Promise((r) => setTimeout(r, 0))
    ac.abort()
    await sub
    expect(received.map((c) => c.type)).toEqual(['TEXT_MESSAGE_CONTENT'])
    expect(received[0].delta).toBe('joined')
  })

  it('does not hang when two send()s race the handshake (waitOpen memoization)', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })
    const ac = new AbortController()

    // Issue two send()s back-to-back BEFORE the fake socket's queued
    // microtask flips readyState/fires onopen. Both `send()` calls resolve
    // openOnce() to the SAME in-flight socket (readyState 0), so both must
    // await the same memoized open-promise rather than clobbering each
    // other's onopen handler.
    const send1 = conn.send(
      [{ role: 'user', content: 'first' } as any],
      undefined,
      ac.signal,
      { threadId: 't1', runId: 'r1' },
    )
    const send2 = conn.send(
      [{ role: 'user', content: 'second' } as any],
      undefined,
      ac.signal,
      { threadId: 't2', runId: 'r2' },
    )

    await Promise.race([
      Promise.all([send1, send2]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('send() calls hung')), 1000),
      ),
    ])

    expect(FakeWebSocket.instances.length).toBe(1)
    const ws = FakeWebSocket.instances[0]
    if (!ws) throw new Error('expected a FakeWebSocket instance to have been created')
    expect(ws.sent.length).toBe(2)
    expect(JSON.parse(ws.sent[0]!).runId).toBe('r1')
    expect(JSON.parse(ws.sent[1]!).runId).toBe('r2')
  })
})
