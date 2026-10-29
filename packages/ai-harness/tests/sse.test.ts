import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HEARTBEAT_MS,
  SLOW_CONSUMER_CLOSE_CODE,
  SLOW_CONSUMER_MS,
  SOCKET_BUFFER_BYTES,
  SOCKET_RECHECK_MS,
  STREAM_DEFAULTS,
  socketSender,
  sseStream,
  streamValues,
  withHeartbeat,
} from '../src/sse'
import type { WebSocketLike } from '@tanstack/ai'
import type { SseFrame } from '../src/sse'

const decoder = new TextDecoder()
const encoder = new TextEncoder()
const textOf = (value: Uint8Array | undefined) => decoder.decode(value)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** Frames that never come. It ends when the stream aborts its signal. */
async function* idle(signal: AbortSignal): AsyncGenerator<SseFrame> {
  await new Promise((resolve) => signal.addEventListener('abort', resolve))
}

/** Endless frames of about 100 kB. `pulled` counts the reads. */
function endless() {
  const state = { pulled: 0, stopped: false }
  const data = JSON.stringify('x'.repeat(100_000))
  async function* frames(signal: AbortSignal): AsyncGenerator<SseFrame> {
    try {
      while (!signal.aborted) {
        state.pulled += 1
        yield { data }
      }
    } finally {
      state.stopped = true
    }
  }
  return { state, frames }
}

describe('streamValues', () => {
  it('keeps the default of each value that is not set', () => {
    expect(streamValues('test')).toEqual(STREAM_DEFAULTS)
    expect(streamValues('test', { heartbeatMs: 5 })).toEqual({
      ...STREAM_DEFAULTS,
      heartbeatMs: 5,
    })
  })

  it.each([
    ['heartbeatMs', 0],
    ['slowConsumerMs', -1],
    ['sseQueueBytes', Number.NaN],
    ['socketBufferBytes', Number.POSITIVE_INFINITY],
  ])('throws for a %s of %s, and names the field', (key, value) => {
    expect(() => streamValues('caller', { [key]: value })).toThrow(
      `caller needs a stream.${key} that is a finite number above 0.`,
    )
  })
})

describe('sseStream', () => {
  it('sends a ping comment every 20 s, and clears its timers on cancel', async () => {
    const reader = sseStream({ frames: idle, requestId: 'r1' }).getReader()
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(textOf((await reader.read()).value)).toBe(': ping\n\n')
    await reader.cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reads the log only while the client reads: the queue holds 1 MB', async () => {
    const { state, frames } = endless()
    const reader = sseStream({ frames, requestId: 'r1' }).getReader()
    await vi.advanceTimersByTimeAsync(0)
    // About 1 MB of 100 kB frames, then it waits for the client.
    expect(state.pulled).toBeGreaterThan(5)
    expect(state.pulled).toBeLessThanOrEqual(12)
    const before = state.pulled
    await reader.read()
    await vi.advanceTimersByTimeAsync(0)
    expect(state.pulled).toBe(before + 1)
    await reader.cancel()
  })

  it('closes a client that reads nothing for 30 s with a slow_consumer frame', async () => {
    const { state, frames } = endless()
    const stream = sseStream({ frames, requestId: 'r1' })
    await vi.advanceTimersByTimeAsync(SLOW_CONSUMER_MS - 1)
    expect(state.stopped).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.stopped).toBe(true)
    const text = await new Response(stream).text()
    expect(text.endsWith('\n\n')).toBe(true)
    const last = text.trimEnd().split('\n\n').at(-1)
    expect(JSON.parse(last!.replace(/^data: /, ''))).toEqual({
      type: 'harness.error',
      message: 'The client reads too slowly.',
      code: 'slow_consumer',
      requestId: 'r1',
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses stream.heartbeatMs for the ping', async () => {
    const reader = sseStream({
      frames: idle,
      requestId: 'r1',
      stream: streamValues('test', { heartbeatMs: 1000 }),
    }).getReader()
    await vi.advanceTimersByTimeAsync(1000)
    expect(textOf((await reader.read()).value)).toBe(': ping\n\n')
    await reader.cancel()
  })

  it('uses stream.sseQueueBytes for the queue, and stream.slowConsumerMs for the close', async () => {
    const { state, frames } = endless()
    const stream = sseStream({
      frames,
      requestId: 'r1',
      stream: streamValues('test', {
        sseQueueBytes: 100_000,
        slowConsumerMs: 1000,
      }),
    })
    await vi.advanceTimersByTimeAsync(0)
    // One 100 kB frame fills the queue.
    expect(state.pulled).toBeLessThanOrEqual(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(state.stopped).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(state.stopped).toBe(true)
    const text = await new Response(stream).text()
    expect(text).toContain('"code":"slow_consumer"')
  })

  it('sends an internal error frame with the requestId when the frames fail', async () => {
    async function* broken(): AsyncGenerator<SseFrame> {
      yield { id: '1', data: '{"a":1}' }
      throw new Error('store down')
    }
    const text = await new Response(
      sseStream({ frames: broken, requestId: 'req-9' }),
    ).text()
    expect(text).toBe(
      'id: 1\ndata: {"a":1}\n\n' +
        'data: {"type":"harness.error","message":"store down","code":"internal","requestId":"req-9"}\n\n',
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends when the signal aborts, and stops the frames', async () => {
    const watch = new AbortController()
    let readerSignal: AbortSignal | undefined
    const stream = sseStream({
      frames: (signal) => {
        readerSignal = signal
        return idle(signal)
      },
      requestId: 'r1',
      signal: watch.signal,
    })
    watch.abort()
    expect(await new Response(stream).text()).toBe('')
    expect(readerSignal?.aborted).toBe(true)
  })
})

describe('withHeartbeat', () => {
  it('adds a ping between two events, never inside one', async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>
    const reader = withHeartbeat(
      new ReadableStream<Uint8Array>({ start: (c) => void (source = c) }),
    ).getReader()
    source.enqueue(encoder.encode('data: 1'))
    expect(textOf((await reader.read()).value)).toBe('data: 1')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    source.enqueue(encoder.encode('\n\n'))
    expect(textOf((await reader.read()).value)).toBe('\n\n')
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(textOf((await reader.read()).value)).toBe(': ping\n\n')
    source.close()
    expect((await reader.read()).done).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses heartbeatMs for the ping', async () => {
    const reader = withHeartbeat(new ReadableStream<Uint8Array>(), {
      heartbeatMs: 1000,
    }).getReader()
    await vi.advanceTimersByTimeAsync(1000)
    expect(textOf((await reader.read()).value)).toBe(': ping\n\n')
    await reader.cancel()
  })
})

function fakeSocket() {
  const handlers: Record<string, Array<(event?: any) => void>> = {}
  const socket = {
    sent: [] as Array<string>,
    closedWith: undefined as number | undefined,
    bufferedAmount: 0,
    send(data: string) {
      socket.sent.push(data)
    },
    close(code?: number) {
      socket.closedWith = code
      handlers.close?.forEach((handler) => handler())
    },
    addEventListener(type: string, handler: (event?: any) => void) {
      ;(handlers[type] ??= []).push(handler)
    },
  }
  const typed: WebSocketLike = socket
  return { socket, typed }
}

describe('socketSender', () => {
  it('waits while the socket buffer is full, then sends in order', async () => {
    const { socket, typed } = fakeSocket()
    const send = socketSender({ socket: typed, requestId: 's1' })
    socket.bufferedAmount = SOCKET_BUFFER_BYTES + 1
    const first = send('{"n":1}')
    const second = send({ type: 'harness.ping' })
    await vi.advanceTimersByTimeAsync(SOCKET_RECHECK_MS * 4)
    expect(socket.sent).toEqual([])
    socket.bufferedAmount = 0
    await vi.advanceTimersByTimeAsync(SOCKET_RECHECK_MS)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(socket.sent).toEqual(['{"n":1}', '{"type":"harness.ping"}'])
    socket.close()
  })

  it('closes a socket that stays full for 30 s, with a slow_consumer frame', async () => {
    const { socket, typed } = fakeSocket()
    const send = socketSender({ socket: typed, requestId: 's1' })
    socket.bufferedAmount = SOCKET_BUFFER_BYTES + 1
    const sent = send('{"n":1}')
    await vi.advanceTimersByTimeAsync(SLOW_CONSUMER_MS)
    await expect(sent).resolves.toBe(false)
    expect(socket.sent.map((data) => JSON.parse(data))).toEqual([
      {
        type: 'harness.error',
        message: 'The client reads too slowly.',
        code: 'slow_consumer',
        requestId: 's1',
      },
    ])
    expect(socket.closedWith).toBe(SLOW_CONSUMER_CLOSE_CODE)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sends a ping every 20 s, and stops its timers when the socket closes', async () => {
    const { socket, typed } = fakeSocket()
    const send = socketSender({ socket: typed, requestId: 's1' })
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS)
    expect(socket.sent).toEqual(['{"type":"harness.ping"}'])
    socket.close()
    expect(vi.getTimerCount()).toBe(0)
    await expect(send('{"n":1}')).resolves.toBe(false)
  })

  it('uses stream.socketBufferBytes for a full buffer, and stream.slowConsumerMs for the close', async () => {
    const { socket, typed } = fakeSocket()
    const send = socketSender({
      socket: typed,
      requestId: 's1',
      stream: streamValues('test', {
        socketBufferBytes: 1000,
        slowConsumerMs: 1000,
      }),
    })
    // Under the default of 8 MiB, but above the 1000 bytes of the option.
    socket.bufferedAmount = 1001
    const sent = send('{"n":1}')
    await vi.advanceTimersByTimeAsync(SOCKET_RECHECK_MS)
    expect(socket.sent).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)
    await expect(sent).resolves.toBe(false)
    expect(socket.closedWith).toBe(SLOW_CONSUMER_CLOSE_CODE)
  })

  it('uses stream.heartbeatMs for the ping', async () => {
    const { socket, typed } = fakeSocket()
    socketSender({
      socket: typed,
      requestId: 's1',
      stream: streamValues('test', { heartbeatMs: 1000 }),
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(socket.sent).toEqual(['{"type":"harness.ping"}'])
    socket.close()
  })

  it('ends a wait when the signal aborts', async () => {
    const { socket, typed } = fakeSocket()
    const stop = new AbortController()
    const send = socketSender({
      socket: typed,
      requestId: 's1',
      signal: stop.signal,
    })
    socket.bufferedAmount = SOCKET_BUFFER_BYTES + 1
    const sent = send('{"n":1}')
    await vi.advanceTimersByTimeAsync(SOCKET_RECHECK_MS)
    stop.abort()
    await expect(sent).resolves.toBe(false)
    expect(socket.sent).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
