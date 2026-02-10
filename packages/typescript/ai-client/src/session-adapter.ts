import type { StreamChunk, UIMessage } from '@tanstack/ai'
import type { ConnectionAdapter } from './connection-adapters'

/**
 * Session adapter interface for persistent stream-based chat sessions.
 *
 * Unlike ConnectionAdapter (which creates a new stream per request),
 * a SessionAdapter maintains a persistent subscription. Responses from
 * send() arrive through subscribe(), not as a return value.
 *
 * The subscribe() stream yields standard AG-UI events (StreamChunk).
 * The processor handles whichever event types it supports — currently
 * text message lifecycle, tool calls, and MESSAGES_SNAPSHOT. Future
 * event handlers (STATE_SNAPSHOT, STATE_DELTA, etc.) are purely additive.
 */
export interface SessionAdapter {
  /**
   * Subscribe to the session stream.
   * Returns an async iterable that yields chunks continuously.
   * For durable sessions, this may first yield a MESSAGES_SNAPSHOT
   * to hydrate the conversation, then subscribe to the live stream
   * from the appropriate offset.
   */
  subscribe(signal?: AbortSignal): AsyncIterable<StreamChunk>

  /**
   * Send messages to the session.
   * For durable sessions, the proxy writes to the stream and forwards to the API.
   * The response arrives through subscribe(), not as a return value.
   */
  send(
    messages: Array<UIMessage>,
    data?: Record<string, any>,
    signal?: AbortSignal,
  ): Promise<void>
}

/**
 * Wraps a ConnectionAdapter into a SessionAdapter using an async queue pattern.
 * send() calls connection.connect() and pushes chunks to the queue.
 * subscribe() yields chunks from the queue.
 */
export function createDefaultSession(
  connection: ConnectionAdapter,
): SessionAdapter {
  const buffer: Array<StreamChunk> = []
  const waiters: Array<(chunk: StreamChunk | null) => void> = []

  function push(chunk: StreamChunk): void {
    const waiter = waiters.shift()
    if (waiter) {
      waiter(chunk)
    } else {
      buffer.push(chunk)
    }
  }

  return {
    async *subscribe(signal?: AbortSignal) {
      while (!signal?.aborted) {
        let chunk: StreamChunk | null
        if (buffer.length > 0) {
          chunk = buffer.shift()!
        } else {
          chunk = await new Promise<StreamChunk | null>((resolve) => {
            const onAbort = () => resolve(null)
            waiters.push((c) => {
              signal?.removeEventListener('abort', onAbort)
              resolve(c)
            })
            signal?.addEventListener('abort', onAbort, { once: true })
          })
        }
        if (chunk !== null) yield chunk
      }
      // Discard any chunks buffered after abort to prevent stale data
      // leaking into the next subscription
      buffer.length = 0
      waiters.length = 0
    },

    async send(messages, data, signal) {
      const stream = connection.connect(messages, data, signal)
      for await (const chunk of stream) {
        push(chunk)
      }
    },
  }
}
