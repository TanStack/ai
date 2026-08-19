import { describe, expect, it } from 'vitest'
import {
  buildTurnRequest,
  decodeWsFrame,
  encodeWsFrame,
  resumeWebSocketResponse,
  resumeWebSocketStream,
  toWebSocketResponse,
  toWebSocketStream,
} from '../src/stream-to-websocket'
import { memoryStream } from '../src/stream-durability'
import { RUN_ACCEPTED_EVENT } from '../src/stream-to-response'
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
    expect(
      decodeWsFrame(JSON.stringify({ type: 'abort', runId: 'r' })),
    ).toEqual({ kind: 'abort', runId: 'r' })
  })
})

class FakeSocket implements WebSocketLike {
  sent: Array<string> = []
  closed = false
  closeCode: number | undefined
  private handlers: Record<string, Array<(ev: { data: unknown }) => void>> = {}
  send(data: string): void {
    if (this.closed) throw new Error('socket is closed')
    this.sent.push(data)
  }
  close(code?: number): void {
    this.closed = true
    this.closeCode = code
    this.emit('close', { data: undefined })
  }
  addEventListener(
    type: 'message' | 'close' | 'error',
    handler: (ev: { data: unknown }) => void,
  ): void {
    ;(this.handlers[type] ??= []).push(handler)
  }
  emitMessage(data: string): void {
    this.emit('message', { data })
  }
  emitClose(): void {
    this.closed = true
    this.emit('close', { data: undefined })
  }
  emitError(): void {
    this.emit('error', { data: undefined })
  }
  private emit(type: string, ev: { data: unknown }): void {
    for (const h of this.handlers[type] ?? []) h(ev)
  }
}

describe('buildTurnRequest', () => {
  it('keys the synthetic request by runId and preserves headers', () => {
    const handshake = new Request('https://x/api/chat', {
      headers: { authorization: 'Bearer t' },
    })
    const req = buildTurnRequest(handshake, 'run-9')
    const url = new URL(req.url)
    expect(url.searchParams.get('runId')).toBe('run-9')
    expect(url.searchParams.get('offset')).toBeNull()
    expect(req.headers.get('authorization')).toBe('Bearer t')
  })

  it('scrubs a handshake ?offset so a mis-routed resume cannot hit the replay branch', () => {
    const req = buildTurnRequest(
      new Request('https://x/api/chat?offset=off-3'),
      'run-9',
    )
    expect(new URL(req.url).searchParams.get('offset')).toBeNull()
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
    expect(types).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
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
      'CUSTOM',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
    expect(frames[0].chunk.name).toBe(RUN_ACCEPTED_EVENT)
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

  it('aborts an in-flight turn when a second run frame reuses the same runId', async () => {
    const socket = new FakeSocket()
    const signals: Array<AbortSignal> = []
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: ({ runId, threadId, signal }): AsyncIterable<StreamChunk> =>
        (async function* () {
          signals.push(signal)
          yield ev.runStarted(runId, threadId)
          await new Promise<void>((resolve) => {
            if (signal.aborted) {
              resolve()
              return
            }
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
        })(),
    })
    socket.emitMessage(inputFrame('run-dup'))
    await flush()
    socket.emitMessage(inputFrame('run-dup'))
    await flush()

    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(socket.closed).toBe(false)
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
    // Valid JSON with an invalid RunAgentInput shape surfaces as RUN_ERROR
    // (see the dedicated test below) rather than crashing the socket.
    expect(() =>
      socket.emitMessage(JSON.stringify({ foo: 'bar' })),
    ).not.toThrow()
    await flush()
    expect(socket.closed).toBe(false)

    socket.emitMessage(inputFrame('run-5'))
    await flush()
    const types = socket.sent.map((s) => JSON.parse(s).type)
    expect(types).toEqual(['RUN_ERROR', 'RUN_STARTED'])
  })

  it('surfaces a turn failure as a live RUN_ERROR frame and keeps the socket open', async () => {
    const socket = new FakeSocket()
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
          yield ev.runStarted(runId, threadId)
          throw new Error('provider exploded')
        })(),
      debug: false,
    })
    socket.emitMessage(inputFrame('run-err'))
    await flush()

    // The conversation socket stays open, so the failure MUST reach the
    // client as a terminal frame — otherwise the consumer hangs forever.
    const frames = socket.sent.map((s) => JSON.parse(s))
    expect(frames.map((f) => f.type)).toEqual(['RUN_STARTED', 'RUN_ERROR'])
    expect(frames[1].message).toContain('provider exploded')
    expect(socket.closed).toBe(false)
  })

  it('surfaces an invalid RunAgentInput body as a RUN_ERROR frame', async () => {
    const socket = new FakeSocket()
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      onRun: () => (async function* () {})(),
      debug: false,
    })
    // Valid JSON, but not a RunAgentInput (missing threadId/runId/messages).
    socket.emitMessage(JSON.stringify({ messages: 'nope' }))
    await flush()
    const types = socket.sent.map((s) => JSON.parse(s).type)
    expect(types).toEqual(['RUN_ERROR'])
    expect(socket.closed).toBe(false)
  })

  it('multiplexes two sequential turns over one socket with separate per-turn durability logs', async () => {
    const socket = new FakeSocket()
    const durabilityRunIds: Array<string | null> = []
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      durability: (ctx) => {
        durabilityRunIds.push(
          new URL(ctx.request.url).searchParams.get('runId'),
        )
        return memoryStream(ctx.request)
      },
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
          yield ev.textContent(runId)
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

    socket.emitMessage(inputFrame('run-a'))
    await flush()
    socket.emitMessage(inputFrame('run-b'))
    await flush()

    // Both turns streamed to completion over the same open socket, and each
    // got its own durability log keyed by its own runId.
    const frames = socket.sent.map((s) => JSON.parse(s))
    expect(frames.every((f) => typeof f.id === 'string' && 'chunk' in f)).toBe(
      true,
    )
    expect(frames.map((f) => f.chunk.type)).toEqual([
      'CUSTOM',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
      'CUSTOM',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
    expect(durabilityRunIds).toEqual(['run-a', 'run-b'])
    // Each turn's replay log is independent: joining run-a replays only run-a.
    const joinA = memoryStream(
      new Request('https://x/api/chat?runId=run-a&offset=-1'),
    )
    const replayed: Array<string> = []
    for await (const entry of joinA.read('-1')) {
      replayed.push(entry.chunk.type)
    }
    expect(replayed).toEqual(['CUSTOM', 'TEXT_MESSAGE_CONTENT', 'RUN_FINISHED'])
    expect(socket.closed).toBe(false)
  })

  it('idle-closes a quiet socket (1000) but never one with a turn still in flight', async () => {
    // Quiet socket: no inbound frame within idleTimeoutMs → reaped.
    const quiet = new FakeSocket()
    toWebSocketStream(quiet, new Request('https://x/api/chat'), {
      onRun: () => (async function* () {})(),
      idleTimeoutMs: 5,
      heartbeatMs: 60_000,
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(quiet.closed).toBe(true)
    expect(quiet.closeCode).toBe(1000)

    // Socket with a parked in-flight turn: a long generation sends no inbound
    // frames, but the idle reaper must not kill live work.
    const busy = new FakeSocket()
    let release: (() => void) | undefined
    toWebSocketStream(busy, new Request('https://x/api/chat'), {
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
          yield ev.runStarted(runId, threadId)
          await new Promise<void>((r) => {
            release = r
          })
        })(),
      idleTimeoutMs: 5,
      heartbeatMs: 60_000,
    })
    busy.emitMessage(inputFrame('run-busy'))
    await new Promise((r) => setTimeout(r, 30))
    expect(busy.closed).toBe(false)
    release?.()
    busy.emitClose()
  })

  it('tears down and aborts turns when the socket errors', async () => {
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
      debug: false,
    })
    socket.emitMessage(inputFrame('run-oops'))
    await flush()
    socket.emitError()
    await flush()
    expect(aborted).toBe(true)
    expect(socket.closed).toBe(true)
    expect(socket.closeCode).toBe(1011)
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
    expect(chunkTypes).toEqual([
      'CUSTOM',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
    expect(JSON.parse(joiner.sent[0]!).chunk.name).toBe(RUN_ACCEPTED_EVENT)
    // Regression: the replay pump must close the socket once the durability
    // log is exhausted, even on the success path (terminal already present).
    // Otherwise a client that auto-reconnects to `?runId&offset` after a
    // drop would see no terminal frame, no close, no error — just a hang.
    expect(joiner.closed).toBe(true)
    expect(joiner.closeCode).toBe(1000)
  })

  it('closes the socket (1000) after replaying a complete log that has NO terminal event', async () => {
    // Simulates a mid-generation drop: the durability log terminalized
    // (log.complete === true) but the producer's turn was aborted by the
    // socket closing before RUN_FINISHED was ever appended. `read` yields
    // whatever was produced and returns with no terminal chunk.
    const noTerminalAdapter: StreamDurability = {
      resumeFrom: () => '-1',
      append: () => Promise.resolve([]),
      read: async function* () {
        yield { offset: 'off-1', chunk: ev.textContent('partial') }
      },
      close: () => Promise.resolve(),
      snapshot: () => Promise.resolve([]),
    }
    const joiner = new FakeSocket()

    resumeWebSocketStream(joiner, { adapter: noTerminalAdapter })
    await flush()

    const chunkTypes = joiner.sent.map((s) => JSON.parse(s).chunk.type)
    expect(chunkTypes).toEqual(['TEXT_MESSAGE_CONTENT'])
    // The proof: no terminal event was ever produced, yet the socket still
    // closes once the log exhausts — no consumer hang, no leaked socket.
    expect(joiner.closed).toBe(true)
    expect(joiner.closeCode).toBe(1000)
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
      snapshot: () => Promise.resolve([]),
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

describe('toWebSocketResponse', () => {
  it('throws a directive error when WebSocketPair is unavailable', () => {
    expect(() =>
      toWebSocketResponse(new Request('https://x/api/chat'), {
        onRun: () => (async function* () {})(),
      }),
    ).toThrow(/WebSocketPair/)
  })
})

describe('resumeWebSocketResponse', () => {
  it('throws a directive error when WebSocketPair is unavailable', () => {
    expect(() =>
      resumeWebSocketResponse({
        adapter: memoryStream(
          new Request('https://x/api/chat?runId=r&offset=-1'),
        ),
      }),
    ).toThrow(/WebSocketPair/)
  })
})
