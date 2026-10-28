import { ndJsonStream } from '@agentclientprotocol/sdk'
import type { AcpJsonRpcStream, AcpMessageFraming } from './types'

function waitForWebSocketOpen(
  ws: WebSocket,
  signal?: AbortSignal,
): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const onOpen = (): void => {
      cleanup()
      resolve()
    }
    const onError = (): void => {
      cleanup()
      reject(new Error('WebSocket connection failed'))
    }
    const onAbort = (): void => {
      cleanup()
      ws.close()
      reject(signal?.reason ?? new Error('WebSocket connection aborted'))
    }
    const cleanup = (): void => {
      ws.removeEventListener('open', onOpen)
      ws.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    ws.addEventListener('open', onOpen)
    ws.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Wrap a stream controller so its terminal calls are idempotent. A WebSocket can
 * fire `close` after `error` (or after the reader cancels), and closing/erroring
 * an already-settled controller throws `ERR_INVALID_STATE` out of the listener.
 */
function idempotentController<T>(
  controller: ReadableStreamDefaultController<T>,
): {
  enqueue: (chunk: T) => void
  close: () => void
  error: (reason: unknown) => void
} {
  let settled = false
  return {
    enqueue: (chunk) => {
      if (!settled) controller.enqueue(chunk)
    },
    close: () => {
      if (settled) return
      settled = true
      controller.close()
    },
    error: (reason) => {
      if (settled) return
      settled = true
      controller.error(reason)
    },
  }
}

/**
 * One JSON-RPC object per WebSocket text frame (e.g. `grok agent serve`).
 */
export function webSocketFrameToAcpStream(ws: WebSocket): AcpJsonRpcStream {
  const decoder = new TextDecoder()

  const readable = new ReadableStream<unknown>({
    start(rawController) {
      const controller = idempotentController(rawController)
      ws.addEventListener('message', (event) => {
        const text =
          typeof event.data === 'string'
            ? event.data
            : decoder.decode(event.data as ArrayBuffer)
        const trimmed = text.trim()
        if (trimmed === '') return
        try {
          controller.enqueue(JSON.parse(trimmed))
        } catch (error) {
          controller.error(
            error instanceof Error ? error : new Error(String(error)),
          )
        }
      })
      ws.addEventListener('close', () => controller.close())
      ws.addEventListener('error', () =>
        controller.error(new Error('WebSocket connection error')),
      )
    },
    cancel() {
      ws.close()
    },
  })

  const writable = new WritableStream({
    write(message) {
      ws.send(JSON.stringify(message))
    },
    close() {
      ws.close()
    },
  })

  return { readable, writable } as AcpJsonRpcStream
}

function webSocketNdjsonToAcpStream(ws: WebSocket): AcpJsonRpcStream {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const readable = new ReadableStream<Uint8Array>({
    start(rawController) {
      const controller = idempotentController(rawController)
      ws.addEventListener('message', (event) => {
        const text =
          typeof event.data === 'string'
            ? event.data
            : decoder.decode(event.data as ArrayBuffer)
        controller.enqueue(encoder.encode(text))
      })
      ws.addEventListener('close', () => controller.close())
      ws.addEventListener('error', () =>
        controller.error(new Error('WebSocket connection error')),
      )
    },
    cancel() {
      ws.close()
    },
  })

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      // TS 5.7+ types Uint8Array as generic over its buffer (ArrayBufferLike),
      // which no longer structurally matches the DOM `BufferSource` param.
      // Runtime accepts any typed array; narrow to the lib's expected type.
      ws.send(chunk as BufferSource)
    },
    close() {
      ws.close()
    },
  })

  return ndJsonStream(writable, readable)
}

export interface ConnectAcpWebSocketOptions {
  headers?: Record<string, string>
  signal?: AbortSignal
  framing?: AcpMessageFraming
}

export interface AcpWebSocketConnection {
  stream: AcpJsonRpcStream
  close: () => void
}

/**
 * Open a WebSocket to an in-sandbox ACP server and adapt it for
 * {@link ClientSideConnection}.
 */
function openWebSocket(
  url: string,
  headers?: Record<string, string>,
): WebSocket {
  if (headers === undefined) return new WebSocket(url)
  // Node/ws accepts `{ headers }`; DOM lib constructor types omit this overload.
  return Reflect.construct(WebSocket, [url, { headers }]) as WebSocket
}

export async function connectAcpWebSocket(
  url: string,
  options: ConnectAcpWebSocketOptions = {},
): Promise<AcpWebSocketConnection> {
  const ws = openWebSocket(url, options.headers)
  await waitForWebSocketOpen(ws, options.signal)

  const framing = options.framing ?? 'frame'
  const stream =
    framing === 'ndjson'
      ? webSocketNdjsonToAcpStream(ws)
      : webSocketFrameToAcpStream(ws)

  return {
    stream,
    close: () => ws.close(),
  }
}

/** Convert an HTTP sandbox channel URL to a WebSocket base URL. */
export function httpChannelUrlToWsBase(channelUrl: string): string {
  return channelUrl.replace(/^http/i, 'ws').replace(/\/$/, '')
}
