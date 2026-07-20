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
})
