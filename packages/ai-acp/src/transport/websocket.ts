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
 * One JSON-RPC object per WebSocket text frame (e.g. `grok agent serve`).
 */
export function webSocketFrameToAcpStream(ws: WebSocket): AcpJsonRpcStream {
  const decoder = new TextDecoder()
  let readController: ReadableStreamDefaultController | undefined

  ws.addEventListener('message', (event) => {
    if (readController === undefined) return
    const text =
      typeof event.data === 'string'
        ? event.data
        : decoder.decode(event.data as ArrayBuffer)
    const trimmed = text.trim()
    if (trimmed === '') return
    try {
      readController.enqueue(JSON.parse(trimmed))
    } catch (error) {
      readController.error(
        error instanceof Error ? error : new Error(String(error)),
      )
    }
  })

  ws.addEventListener('close', () => readController?.close())
  ws.addEventListener('error', () => {
    readController?.error(new Error('WebSocket connection error'))
  })

  const readable = new ReadableStream({
    start(controller) {
      readController = controller
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
    start(controller) {
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
      ws.send(chunk)
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
interface WebSocketWithHeaders {
  new (
    url: string,
    options?: { headers?: Record<string, string> },
  ): WebSocket
}

const WebSocketCtor = WebSocket as unknown as WebSocketWithHeaders

export async function connectAcpWebSocket(
  url: string,
  options: ConnectAcpWebSocketOptions = {},
): Promise<AcpWebSocketConnection> {
  const ws =
    options.headers !== undefined
      ? new WebSocketCtor(url, { headers: options.headers })
      : new WebSocketCtor(url)
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