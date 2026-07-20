import { describe, expect, it } from 'vitest'
import {
  buildTurnRequest,
  decodeWsFrame,
  encodeWsFrame,
  toWebSocketStream,
} from '../src/stream-to-websocket'
import { ev } from './test-utils'
import type { WebSocketLike } from '../src/stream-to-websocket'
import type { StreamChunk } from '../src/types'

describe('ws frame codec', () => {
  it('encodes a durable frame as an { id, chunk } envelope', () => {
    const chunk = ev.textContent('hi')
    expect(JSON.parse(encodeWsFrame(chunk, 'off-1'))).toEqual({
      id: 'off-1',
      chunk,
    })
  })

  it('encodes a non-durable frame as a bare chunk', () => {
    const chunk = ev.textContent('hi')
    expect(JSON.parse(encodeWsFrame(chunk, undefined))).toEqual(chunk)
  })

  it('decodes a RunAgentInput frame as a run', () => {
    const input = { threadId: 't', runId: 'r', messages: [] }
    expect(decodeWsFrame(JSON.stringify(input))).toEqual({
      kind: 'run',
      input,
    })
  })

  it('decodes an abort control frame', () => {
    expect(decodeWsFrame(JSON.stringify({ type: 'abort', runId: 'r' }))).toEqual(
      { kind: 'abort', runId: 'r' },
    )
  })
})

class FakeSocket implements WebSocketLike {
  sent: Array<string> = []
  closed = false
  closeCode: number | undefined
  bufferedAmount = 0
  private handlers: Record<string, Array<(ev: any) => void>> = {}
  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number): void {
    this.closed = true
    this.closeCode = code
    this.emit('close', { code })
  }
  addEventListener(type: string, handler: (ev: any) => void): void {
    ;(this.handlers[type] ??= []).push(handler)
  }
  emitMessage(data: string): void {
    this.emit('message', { data })
  }
  emitClose(): void {
    this.emit('close', {})
  }
  private emit(type: string, ev: any): void {
    for (const h of this.handlers[type] ?? []) h(ev)
  }
}

describe('FakeSocket double', () => {
  it('records sent frames and delivers messages to listeners', () => {
    const socket = new FakeSocket()
    const received: Array<string> = []
    socket.addEventListener('message', (e) => received.push(e.data))
    socket.send('a')
    socket.emitMessage('b')
    expect(socket.sent).toEqual(['a'])
    expect(received).toEqual(['b'])
  })
})

describe('buildTurnRequest', () => {
  it('keys the synthetic request by runId and preserves headers', () => {
    const handshake = new Request('https://x/api/chat', {
      headers: { authorization: 'Bearer t' },
    })
    const req = buildTurnRequest(handshake, 'run-9', null)
    const url = new URL(req.url)
    expect(url.searchParams.get('runId')).toBe('run-9')
    expect(url.searchParams.get('offset')).toBeNull()
    expect(req.headers.get('authorization')).toBe('Bearer t')
  })

  it('adds ?offset on a reconnect', () => {
    const req = buildTurnRequest(
      new Request('https://x/api/chat'),
      'run-9',
      'off-3',
    )
    expect(new URL(req.url).searchParams.get('offset')).toBe('off-3')
  })
})

function inputFrame(runId: string): string {
  return JSON.stringify({
    threadId: 'thread-1',
    runId,
    messages: [{ id: 'u1', role: 'user', content: 'hi' }],
    tools: [],
    context: [],
    forwardedProps: {},
    state: {},
  })
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('toWebSocketStream (non-durable)', () => {
  it('pumps onRun chunks as bare frames and keeps the socket open', async () => {
    const socket = new FakeSocket()
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
          yield ev.runStarted(runId, threadId)
          yield ev.textContent('a')
          yield {
            type: 'RUN_FINISHED',
            runId,
            threadId,
            model: 'm',
            finishReason: 'stop',
            timestamp: Date.now(),
          } as StreamChunk
        })(),
    })
    socket.emitMessage(inputFrame('run-1'))
    await flush()

    const types = socket.sent.map((s) => JSON.parse(s).type)
    expect(types).toEqual(['RUN_STARTED', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED'])
    expect(socket.closed).toBe(false) // conversation-scoped: stays open
  })
})
