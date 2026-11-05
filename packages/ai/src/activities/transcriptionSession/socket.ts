import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import type { LiveTranscriptionConnectOptions } from './adapter'

/** A WebSocket constructor. Pass one to run on a runtime with no global `WebSocket`. */
export type WebSocketConstructor = new (
  url: string,
  protocols?: string | Array<string>,
) => WebSocket

export interface LiveSocketOptions {
  /** The provider URL. Not needed when you pass `socket`. */
  url?: string
  protocols?: string | Array<string>
  /** Defaults to `globalThis.WebSocket`. */
  WebSocket?: WebSocketConstructor
  /**
   * A socket that is already open, such as one from the Workers AI binding.
   * Used instead of opening `url`.
   */
  socket?: WebSocket
  /** The `emit`, `end` and `abortSignal` from the adapter's connect options. */
  connect: Pick<LiveTranscriptionConnectOptions, 'emit' | 'end' | 'abortSignal'>
  /** Runs once the socket is open. Send setup messages here. */
  onOpen?: (socket: LiveSocket) => void
  /**
   * Resolve only once a message matches, for providers that must confirm
   * setup before they take audio. Without it, resolve when the socket opens.
   */
  readyWhen?: (message: unknown) => boolean
  /** Each JSON frame, text or binary. Frames that are not JSON are skipped. */
  onMessage: (message: unknown, socket: LiveSocket) => void
  /** Reject `connect` when the socket is not ready after this long. Defaults to 15000. */
  connectTimeoutMs?: number
}

export interface LiveSocket {
  sendJson: (value: unknown) => void
  sendBinary: (bytes: Uint8Array) => void
  /** True after `finish()` was called. */
  readonly closing: boolean
  /**
   * Send an optional last message, then wait for the socket to close. The
   * provider closes it, or the adapter calls `close()` when the last text
   * arrives. After `timeoutMs` the socket is closed anyway.
   */
  finish: (lastMessage?: unknown, timeoutMs?: number) => Promise<void>
  /** Close the socket now. */
  close: () => void
  /**
   * Report a provider error. Before the socket is ready it rejects `connect`
   * and closes the socket. After that it emits an `error` event.
   */
  fail: (error: Error) => void
}

/** Base64-encode a byte view (Node Buffers can be views into a larger pool). */
export function bytesToBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  )
}

const decoder = new TextDecoder()

/**
 * Open a provider WebSocket for a live transcription adapter. It reports
 * unexpected closes as `error` events, calls `end()` once on close, and closes
 * on abort. Resolves when the socket is open.
 */
export function openLiveSocket(
  options: LiveSocketOptions,
): Promise<LiveSocket> {
  const { emit, end, abortSignal } = options.connect
  const Ctor = options.WebSocket ?? globalThis.WebSocket
  if (!options.socket && (typeof Ctor !== 'function' || !options.url)) {
    return Promise.reject(
      new Error('No WebSocket available. Pass a WebSocket constructor.'),
    )
  }
  if (abortSignal?.aborted) {
    return Promise.reject(
      abortSignal.reason instanceof Error
        ? abortSignal.reason
        : new Error('The session was aborted before it connected.'),
    )
  }
  const ws = options.socket ?? new Ctor(options.url ?? '', options.protocols)
  ws.binaryType = 'arraybuffer'
  let closing = false
  let ready = false
  let resolveClosed!: () => void
  const closed = new Promise<void>((r) => (resolveClosed = r))
  let rejectConnect: (error: Error) => void = () => {}

  const live: LiveSocket = {
    sendJson: (value) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(value))
    },
    sendBinary: (bytes) => {
      // Audio bytes are never backed by a SharedArrayBuffer.
      if (ws.readyState === 1) ws.send(bytes as Uint8Array<ArrayBuffer>)
    },
    get closing() {
      return closing
    },
    finish: async (lastMessage, timeoutMs = 5000) => {
      if (closing) return closed
      closing = true
      if (lastMessage !== undefined) live.sendJson(lastMessage)
      const timer = setTimeout(() => ws.close(1000), timeoutMs)
      await closed
      clearTimeout(timer)
    },
    close: () => {
      closing = true
      if (ws.readyState < 2) ws.close(1000)
    },
    fail: (error) => {
      if (ready) {
        emit({ type: 'error', error })
        return
      }
      rejectConnect(error)
      live.close()
    },
  }

  const onAbort = () => live.close()
  abortSignal?.addEventListener('abort', onAbort, { once: true })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        live.fail(
          new Error(
            `Timed out after ${options.connectTimeoutMs ?? 15000} ms waiting for the provider to be ready.`,
          ),
        ),
      options.connectTimeoutMs ?? 15000,
    )
    rejectConnect = reject
    const markReady = () => {
      clearTimeout(timer)
      ready = true
      resolve(live)
    }
    const onOpen = () => {
      options.onOpen?.(live)
      if (!options.readyWhen) markReady()
    }
    if (options.socket) queueMicrotask(onOpen)
    else ws.addEventListener('open', onOpen)
    ws.addEventListener('message', (event: MessageEvent) => {
      // Some providers (Gemini Live) send JSON in binary frames.
      const text =
        typeof event.data === 'string'
          ? event.data
          : event.data instanceof ArrayBuffer
            ? decoder.decode(event.data)
            : undefined
      if (text === undefined) return
      let message: unknown
      try {
        message = JSON.parse(text)
      } catch {
        return
      }
      if (!ready && options.readyWhen?.(message)) markReady()
      options.onMessage(message, live)
    })
    ws.addEventListener('close', (event: CloseEvent) => {
      abortSignal?.removeEventListener('abort', onAbort)
      const clean = event.code === 1000 || event.code === 1005
      if (!ready) {
        clearTimeout(timer)
        reject(
          new Error(
            `Could not connect to ${options.url ? new URL(options.url).host : 'the provider'} (code ${event.code}${event.reason ? `: ${event.reason}` : ''}).`,
          ),
        )
      } else if (!clean && !closing) {
        emit({
          type: 'error',
          error: new Error(
            `Connection closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}.`,
          ),
        })
      }
      resolveClosed()
      end()
    })
  })
}
