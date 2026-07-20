import { describe, expect, it } from 'vitest'
import {
  buildTurnRequest,
  decodeWsFrame,
  encodeWsFrame,
  resumeWebSocketStream,
  toWebSocketStream,
} from '../src/stream-to-websocket'
import { memoryStream } from '../src/stream-durability'
import { ev } from './test-utils'
import type { WebSocketLike } from '../src/stream-to-websocket'
import type { StreamDurability } from '../src/stream-durability'
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

describe('toWebSocketStream (durable)', () => {
  it('tags each frame with an { id, chunk } envelope from the durability log', async () => {
    const socket = new FakeSocket()
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      durability: (ctx) => memoryStream(ctx.request),
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
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
    socket.emitMessage(inputFrame('run-2'))
    await flush()

    const frames = socket.sent.map((s) => JSON.parse(s))
    expect(frames.every((f) => typeof f.id === 'string' && 'chunk' in f)).toBe(
      true,
    )
    expect(frames.map((f) => f.chunk.type)).toEqual([
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
  })
})

describe('toWebSocketStream lifecycle', () => {
  it('aborts the matching turn on an abort control frame', async () => {
    const socket = new FakeSocket()
    let aborted = false
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: ({ runId, threadId, signal }): AsyncIterable<StreamChunk> =>
        (async function* () {
          yield ev.runStarted(runId, threadId)
          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => {
              aborted = true
              resolve()
            })
          })
        })(),
    })
    socket.emitMessage(inputFrame('run-3'))
    await flush()
    socket.emitMessage(JSON.stringify({ type: 'abort', runId: 'run-3' }))
    await flush()
    expect(aborted).toBe(true)
  })

  it('aborts the active turn when the socket closes', async () => {
    const socket = new FakeSocket()
    let aborted = false
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: ({ signal }): AsyncIterable<StreamChunk> =>
        // eslint-disable-next-line require-yield
        (async function* () {
          await new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => {
              aborted = true
              resolve()
            })
          })
        })(),
    })
    socket.emitMessage(inputFrame('run-4'))
    await flush()
    socket.emitClose()
    await flush()
    expect(aborted).toBe(true)
  })

  it('drops a malformed inbound frame without crashing the socket, and still processes a subsequent valid frame', async () => {
    const socket = new FakeSocket()
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
          yield ev.runStarted(runId, threadId)
        })(),
      debug: false,
    })

    expect(() => socket.emitMessage('{')).not.toThrow()
    await flush()
    expect(() =>
      socket.emitMessage(JSON.stringify({ foo: 'bar' })),
    ).not.toThrow()
    await flush()
    expect(socket.closed).toBe(false)

    socket.emitMessage(inputFrame('run-5'))
    await flush()
    const types = socket.sent.map((s) => JSON.parse(s).type)
    expect(types).toEqual(['RUN_STARTED'])
  })
})

describe('resumeWebSocketStream', () => {
  it('replays a completed run from the log without running a model', async () => {
    // Produce a run into the shared memory log first.
    const producer = new FakeSocket()
    toWebSocketStream(producer, new Request('https://x/api/chat'), {
      durability: (ctx) => memoryStream(ctx.request),
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
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
    producer.emitMessage(inputFrame('run-join'))
    await flush()

    // Join from the start via a read-only replay socket.
    const joiner = new FakeSocket()
    const joinReq = new Request('https://x/api/chat?runId=run-join&offset=-1')
    resumeWebSocketStream(joiner, { adapter: memoryStream(joinReq) })
    await flush()

    const chunkTypes = joiner.sent.map((s) => JSON.parse(s).chunk.type)
    expect(chunkTypes).toEqual(['TEXT_MESSAGE_CONTENT', 'RUN_FINISHED'])
  })

  it('closes with 1008 when no offset is present', async () => {
    const joiner = new FakeSocket()
    resumeWebSocketStream(joiner, {
      adapter: memoryStream(new Request('https://x/api/chat')),
    })
    await flush()
    expect(joiner.closed).toBe(true)
    expect(joiner.closeCode).toBe(1008)
  })

  it('closes with 1011 instead of leaking an unhandled rejection when the replay log throws', async () => {
    const failingAdapter: StreamDurability = {
      resumeFrom: () => 'off-1',
      append: () => Promise.resolve([]),
      // eslint-disable-next-line require-yield
      read: async function* () {
        throw new Error('boom')
      },
      close: () => Promise.resolve(),
    }
    const joiner = new FakeSocket()

    expect(() =>
      resumeWebSocketStream(joiner, { adapter: failingAdapter, debug: false }),
    ).not.toThrow()
    await flush()

    expect(joiner.closed).toBe(true)
    expect(joiner.closeCode).toBe(1011)
  })
})
