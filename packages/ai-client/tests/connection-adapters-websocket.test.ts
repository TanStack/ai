import { describe, expect, it } from 'vitest'
import { StreamReconnectLimitError, webSocket } from '../src/connection-adapters'

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

/** Let queued microtasks (and delayMs: 0 reconnect delays) settle. */
function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

/**
 * Drain an async iterator to completion, collecting yielded values. Used
 * (instead of `drain()`) where the test needs the returned promise to REJECT
 * when the generator throws, rather than swallowing it.
 */
async function drainToEnd(
  iter: AsyncIterator<any>,
): Promise<Array<any>> {
  const received: Array<any> = []
  for (;;) {
    const { value, done } = await iter.next()
    if (done) return received
    received.push(value)
  }
}

/**
 * Race a promise against a bounded timeout so a regression that hangs the
 * generator (instead of rejecting it) fails the test loudly rather than
 * hanging the whole suite.
 */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), 1000)
    }),
  ])
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

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        Promise.all([send1, send2]),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('send() calls hung')), 1000)
        }),
      ])
    } finally {
      clearTimeout(timeoutId)
    }

    expect(FakeWebSocket.instances.length).toBe(1)
    const ws = FakeWebSocket.instances[0]
    if (!ws) throw new Error('expected a FakeWebSocket instance to have been created')
    expect(ws.sent.length).toBe(2)
    const sent0 = ws.sent[0]
    if (sent0 === undefined) throw new Error('expected a sent frame')
    const sent1 = ws.sent[1]
    if (sent1 === undefined) throw new Error('expected a sent frame')
    expect(JSON.parse(sent0).runId).toBe('r1')
    expect(JSON.parse(sent1).runId).toBe('r2')
  })
})

describe('webSocket() reconnect', () => {
  it('reopens with ?runId&offset after a drop and de-dupes the overlap', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      reconnect: { delayMs: 0, maxAttempts: 5 },
    })
    const ac = new AbortController()
    const received: Array<any> = []
    const sub = drain(conn.subscribe(ac.signal), received, ac.signal)
    await conn.send([{ role: 'user', content: 'hi' } as any], undefined, ac.signal, {
      threadId: 't',
      runId: 'run-x',
    })
    const ws1 = FakeWebSocket.instances[0]
    if (!ws1) throw new Error('expected a FakeWebSocket instance to have been created')
    await new Promise((r) => setTimeout(r, 0))
    ws1.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'a', timestamp: 0 }, 'off-1')
    await new Promise((r) => setTimeout(r, 0))
    ws1.close() // drop mid-run

    await new Promise((r) => setTimeout(r, 5))
    const ws2 = FakeWebSocket.instances[1]
    expect(ws2).toBeDefined()
    if (!ws2) throw new Error('expected a second FakeWebSocket instance to have been created')
    const url2 = new URL(ws2.url)
    expect(url2.searchParams.get('runId')).toBe('run-x')
    expect(url2.searchParams.get('offset')).toBe('off-1')

    // Server replays the de-duped boundary + a new chunk + terminal.
    ws2.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'a', timestamp: 0 }, 'off-1')
    ws2.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'b', timestamp: 0 }, 'off-2')
    ws2.emit(
      { type: 'RUN_FINISHED', runId: 'run-x', threadId: 't', model: 'm', finishReason: 'stop', timestamp: 0 },
      'off-3',
    )
    await new Promise((r) => setTimeout(r, 0))
    ac.abort()
    await sub
    expect(received.map((c) => c.delta ?? c.type)).toEqual([
      'a',
      'b',
      'RUN_FINISHED',
    ])
  })
})

describe('webSocket() fatal drop surfacing', () => {
  it('a non-durable drop (no offset ever seen) rejects subscribe() with StreamReadError and does not reconnect', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    })
    const ac = new AbortController()
    // Use the raw iterator (not the `drain` helper) so the promise driving
    // consumption REJECTS when the generator throws — `drain`'s for-await
    // would also reject the same way, but we want an explicit iterator to
    // control exactly when `.next()` is pulled relative to the drop below.
    const iter = conn.subscribe(ac.signal)[Symbol.asyncIterator]()

    await conn.send(
      [{ role: 'user', content: 'hi' } as any],
      undefined,
      ac.signal,
      { threadId: 't', runId: 'r' },
    )
    const ws = FakeWebSocket.instances[0]
    if (!ws) throw new Error('expected a FakeWebSocket instance to have been created')
    await tick()

    // Bare chunk — NO id envelope, so no durable offset is ever tracked.
    // This chunk lands in the sink's buffer (queue) BEFORE the consumer has
    // pulled anything via .next(), reproducing the real chat-client shape
    // (chunks can arrive well before the consumer's next await).
    ws.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'a', timestamp: 0 })
    await tick()

    // Fatal drop: no lastEventId was ever observed, so `onclose` fails the
    // run immediately instead of attempting a reconnect.
    ws.close()

    const result = await withTimeout(
      drainToEnd(iter),
      'subscribe() hung instead of rejecting after a non-durable drop — the ' +
        'fatal failure was recorded but never surfaced to the consumer',
    )
      .then((received) => ({ received, error: undefined as unknown }))
      .catch((error: unknown) => ({ received: undefined, error }))

    // The buffered chunk delivered before the drop must still be observed —
    // the fix drains the buffer before checking for a recorded failure.
    expect(result.error).toBeDefined()
    expect((result.error as Error).name).toBe('StreamReadError')

    // No reconnect: a non-durable stream has no offset to resume from.
    expect(FakeWebSocket.instances.length).toBe(1)
  })

  it('exceeding the reconnect ceiling on a durable run with no forward progress rejects subscribe() with StreamReconnectLimitError', async () => {
    FakeWebSocket.instances = []
    const conn = webSocket('wss://x/api/chat', {
      WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
      reconnect: { delayMs: 0, maxAttempts: 2 },
    })
    const ac = new AbortController()
    const iter = conn.subscribe(ac.signal)[Symbol.asyncIterator]()

    await conn.send(
      [{ role: 'user', content: 'hi' } as any],
      undefined,
      ac.signal,
      { threadId: 't', runId: 'run-stuck' },
    )
    const ws1 = FakeWebSocket.instances[0]
    if (!ws1) throw new Error('expected a FakeWebSocket instance to have been created')
    await tick()

    // One durable chunk establishes an offset (and makes progress, resetting
    // the no-progress counter), then the socket drops — this reconnect is
    // legitimate and does not count against the ceiling.
    ws1.emit({ type: 'TEXT_MESSAGE_CONTENT', delta: 'a', timestamp: 0 }, 'off-1')
    await tick()
    ws1.close()
    await tick()

    // From here on, every reconnect opens a socket that drops immediately
    // with NO new chunk — no forward progress — which is exactly what the
    // ceiling bounds. With maxAttempts: 2, the 3rd consecutive no-progress
    // close must exceed it.
    const ws2 = FakeWebSocket.instances[1]
    if (!ws2) throw new Error('expected a second FakeWebSocket instance (post-drop reconnect)')
    ws2.close() // no-progress attempt 1 (1 <= 2, reconnects again)
    await tick()

    const ws3 = FakeWebSocket.instances[2]
    if (!ws3) throw new Error('expected a third FakeWebSocket instance')
    ws3.close() // no-progress attempt 2 (2 <= 2, reconnects again)
    await tick()

    const ws4 = FakeWebSocket.instances[3]
    if (!ws4) throw new Error('expected a fourth FakeWebSocket instance')
    ws4.close() // no-progress attempt 3 (3 > 2, ceiling exceeded)
    await tick()

    const result = await withTimeout(
      drainToEnd(iter),
      'subscribe() hung instead of rejecting once the reconnect ceiling was exceeded',
    )
      .then((received) => ({ received, error: undefined as unknown }))
      .catch((error: unknown) => ({ received: undefined, error }))

    expect(result.error).toBeDefined()
    expect(result.error).toBeInstanceOf(StreamReconnectLimitError)

    // Every reconnect attempt actually opened a fresh socket (4 total: the
    // original send() connection plus 3 reconnects), confirming the ceiling
    // was reached via genuine no-progress reconnects, not a shortcut.
    expect(FakeWebSocket.instances.length).toBe(4)
  })
})
