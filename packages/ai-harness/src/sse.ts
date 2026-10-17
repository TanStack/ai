// The stream writers of the session tier: SSE and the socket. Each has a
// heartbeat, backpressure, and a close for a client that does not read.
// ponytail: the values are fixed (the protocol page lists them). Add options
// when an app needs other values.
import type { WebSocketLike } from '@tanstack/ai'
import type { HostFrame } from './protocol'

/** A heartbeat goes out after this long, so proxies keep the stream open. */
export const HEARTBEAT_MS = 20_000
/** A client that reads nothing for this long, while events wait, is closed. */
export const SLOW_CONSUMER_MS = 30_000
/** The bytes that an SSE stream keeps ready before it stops reading the log. */
export const SSE_QUEUE_BYTES = 1024 * 1024
/** The socket buffer above which the sender stops reading the log. */
export const SOCKET_BUFFER_BYTES = 8 * 1024 * 1024
/** How often a full socket is checked again. */
export const SOCKET_RECHECK_MS = 50
/** The close code of a socket that was too slow. */
export const SLOW_CONSUMER_CLOSE_CODE = 4408

const encoder = new TextEncoder()
const PING = encoder.encode(': ping\n\n')

/** One SSE event. `data` is JSON text, for example a `wireFrame`. */
export interface SseFrame {
  id?: string
  data: string
}

const errorFrame = (
  code: 'slow_consumer' | 'internal',
  message: string,
  requestId: string,
): HostFrame => ({ type: 'harness.error', message, code, requestId })

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * A pull-based SSE body. It reads the next frame only when the client has
 * read enough: the queue holds at most `SSE_QUEUE_BYTES`. A slow client
 * reads later, from the log. The stream also sends a `: ping` comment every
 * `HEARTBEAT_MS`, and it closes with a `slow_consumer` error frame when the
 * queue stays full for `SLOW_CONSUMER_MS`. When `frames` throws, the stream
 * sends an `internal` error frame and closes. Aborting `signal` closes it.
 *
 * @example
 * ```ts
 * const body = sseStream({
 *   frames: (signal) => toSse(session.events({ from, signal })),
 *   requestId,
 * })
 * ```
 */
export function sseStream({
  frames,
  requestId,
  signal,
}: {
  /** Gets the signal of the reader. The stream aborts it when it ends. */
  frames: (signal: AbortSignal) => AsyncIterable<SseFrame>
  requestId: string
  signal?: AbortSignal
}): ReadableStream<Uint8Array> {
  const reader = new AbortController()
  let iterator: AsyncIterator<SseFrame> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let slow: ReturnType<typeof setTimeout> | undefined
  let isDone = false
  let onAbort: (() => void) | undefined

  const stop = () => {
    isDone = true
    if (onAbort) signal?.removeEventListener('abort', onAbort)
    clearInterval(heartbeat)
    clearTimeout(slow)
    reader.abort()
    void iterator?.return?.()?.catch(() => {})
  }
  const end = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    last?: HostFrame,
  ) => {
    if (isDone) return
    stop()
    if (last)
      controller.enqueue(
        encoder.encode(sseText({ data: JSON.stringify(last) })),
      )
    controller.close()
  }
  // A full queue means the client does not read. Give it time, then close.
  const watchQueue = (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    if (slow !== undefined || (controller.desiredSize ?? 1) > 0) return
    slow = setTimeout(
      () =>
        end(
          controller,
          errorFrame(
            'slow_consumer',
            'The client reads too slowly.',
            requestId,
          ),
        ),
      SLOW_CONSUMER_MS,
    )
  }

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        iterator = frames(reader.signal)[Symbol.asyncIterator]()
        heartbeat = setInterval(() => {
          controller.enqueue(PING)
          watchQueue(controller)
        }, HEARTBEAT_MS)
        onAbort = () => end(controller)
        if (signal?.aborted) return end(controller)
        signal?.addEventListener('abort', onAbort, { once: true })
      },
      async pull(controller) {
        // The client read, so it is not slow.
        clearTimeout(slow)
        slow = undefined
        if (isDone || !iterator) return
        try {
          const next = await iterator.next()
          if (isDone) return
          if (next.done) return end(controller)
          controller.enqueue(encoder.encode(sseText(next.value)))
          watchQueue(controller)
        } catch (error) {
          end(
            controller,
            errorFrame('internal', errorMessage(error), requestId),
          )
        }
      },
      cancel: stop,
    },
    new ByteLengthQueuingStrategy({ highWaterMark: SSE_QUEUE_BYTES }),
  )
}

function sseText({ id, data }: SseFrame) {
  return `${id === undefined ? '' : `id: ${id}\n`}data: ${data}\n\n`
}

/**
 * `body` with a `: ping` comment every `HEARTBEAT_MS`, for the SSE bodies of
 * the core (`POST run`, `GET run`). A comment goes in only between two
 * events, never inside one. SSE parsers skip comments.
 */
export function withHeartbeat(
  body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const source = body.getReader()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  // True when the bytes sent so far end with a blank line: an event ended.
  let isBetweenEvents = true
  return new ReadableStream<Uint8Array>({
    start(controller) {
      heartbeat = setInterval(() => {
        if (isBetweenEvents) controller.enqueue(PING)
      }, HEARTBEAT_MS)
    },
    async pull(controller) {
      try {
        const { done, value } = await source.read()
        if (done) {
          clearInterval(heartbeat)
          return controller.close()
        }
        const size = value.byteLength
        if (size > 0)
          isBetweenEvents =
            size >= 2 && value[size - 1] === 10 && value[size - 2] === 10
        controller.enqueue(value)
      } catch (error) {
        clearInterval(heartbeat)
        controller.error(error)
      }
    },
    cancel(reason) {
      clearInterval(heartbeat)
      return source.cancel(reason)
    },
  })
}

/**
 * A sender for a session-tier socket. Frames go out in order. Before each
 * frame it reads `socket.bufferedAmount`: above `SOCKET_BUFFER_BYTES` it
 * waits, and checks again every `SOCKET_RECHECK_MS`. So the caller, which
 * awaits each send, stops reading the log. After `SLOW_CONSUMER_MS` it sends
 * a `slow_consumer` error frame and closes the socket with code 4408. It
 * also sends a `harness.ping` frame every `HEARTBEAT_MS`. Its timers stop
 * when the socket closes or fails, or when `signal` aborts.
 *
 * A socket without `bufferedAmount` gets no backpressure.
 *
 * @example
 * ```ts
 * const send = socketSender({ socket, requestId, signal })
 * for await (const entry of events) if (!(await send(wireFrame(entry)))) break
 * ```
 */
export function socketSender({
  socket,
  requestId,
  signal,
}: {
  socket: WebSocketLike
  /** Named in the `slow_consumer` error frame. */
  requestId: string
  signal?: AbortSignal
}): (frame: HostFrame | string) => Promise<boolean> {
  let isClosed = false
  let recheck: ReturnType<typeof setTimeout> | undefined
  let wake: (() => void) | undefined
  let queue = Promise.resolve(true)
  const isFull = () => (socket.bufferedAmount ?? 0) > SOCKET_BUFFER_BYTES

  const stop = () => {
    isClosed = true
    clearInterval(ping)
    clearTimeout(recheck)
    wake?.()
  }
  const ping = setInterval(() => {
    if (isFull()) return
    try {
      socket.send(JSON.stringify({ type: 'harness.ping' }))
    } catch {
      stop()
    }
  }, HEARTBEAT_MS)
  socket.addEventListener('close', stop)
  socket.addEventListener('error', stop)
  if (signal?.aborted) stop()
  signal?.addEventListener('abort', stop, { once: true })

  // Resolves true when the buffer has room, false when the socket closed.
  const room = () =>
    new Promise<boolean>((resolve) => {
      let waited = 0
      wake = () => resolve(false)
      const check = () => {
        if (isClosed) return resolve(false)
        if (!isFull()) return resolve(true)
        if (waited >= SLOW_CONSUMER_MS) {
          const frame = errorFrame(
            'slow_consumer',
            'The client reads too slowly.',
            requestId,
          )
          try {
            socket.send(JSON.stringify(frame))
            socket.close(SLOW_CONSUMER_CLOSE_CODE, 'slow_consumer')
          } catch {
            // The socket is gone already.
          }
          stop()
          return resolve(false)
        }
        waited += SOCKET_RECHECK_MS
        recheck = setTimeout(check, SOCKET_RECHECK_MS)
      }
      check()
    })

  const sendNow = async (frame: HostFrame | string) => {
    if (isClosed) return false
    if (isFull() && !(await room())) return false
    try {
      socket.send(typeof frame === 'string' ? frame : JSON.stringify(frame))
      return true
    } catch {
      stop()
      return false
    }
  }
  return (frame) => (queue = queue.then(() => sendNow(frame)))
}
