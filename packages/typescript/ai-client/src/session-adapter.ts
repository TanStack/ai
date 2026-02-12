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
  subscribe: (signal?: AbortSignal) => AsyncIterable<StreamChunk>

  /**
   * Send messages to the session.
   * For durable sessions, the proxy writes to the stream and forwards to the API.
   * The response arrives through subscribe(), not as a return value.
   */
  send: (
    messages: Array<UIMessage>,
    data?: Record<string, any>,
    signal?: AbortSignal,
  ) => Promise<void>
}

/**
 * Wraps a ConnectionAdapter into a SessionAdapter using an async queue pattern.
 * send() calls connection.connect() and pushes chunks to the queue.
 * subscribe() yields chunks from the queue.
 *
 * Each subscribe() call synchronously replaces the active buffer/waiters
 * so that concurrent send() calls write to the current subscription's queue.
 * This prevents a race condition where an old subscription's async cleanup
 * (clearing the shared buffer after abort) could destroy chunks intended
 * for a new subscription.
 */
export function createDefaultSession(
  connection: ConnectionAdapter,
): SessionAdapter {
  // Active buffer and waiters — replaced synchronously on each subscribe() call
  let activeBuffer: Array<StreamChunk> = []
  let activeWaiters: Array<(chunk: StreamChunk | null) => void> = []

  function push(chunk: StreamChunk): void {
    const waiter = activeWaiters.shift()
    if (waiter) {
      waiter(chunk)
    } else {
      activeBuffer.push(chunk)
    }
  }

  return {
    subscribe(signal?: AbortSignal): AsyncIterable<StreamChunk> {
      // Drain any buffered chunks (e.g. from send() before subscribe()) into
      // a fresh per-subscription buffer. splice(0) atomically empties the old
      // array, so a previous subscription's local reference becomes empty.
      const myBuffer: Array<StreamChunk> = activeBuffer.splice(0)
      const myWaiters: Array<(chunk: StreamChunk | null) => void> = []
      activeBuffer = myBuffer
      activeWaiters = myWaiters

      return (async function* () {
        while (!signal?.aborted) {
          let chunk: StreamChunk | null
          if (myBuffer.length > 0) {
            chunk = myBuffer.shift()!
          } else {
            chunk = await new Promise<StreamChunk | null>((resolve) => {
              const onAbort = () => resolve(null)
              myWaiters.push((c) => {
                signal?.removeEventListener('abort', onAbort)
                resolve(c)
              })
              signal?.addEventListener('abort', onAbort, { once: true })
            })
          }
          if (chunk !== null) yield chunk
        }
        // No shared-state cleanup needed — myBuffer/myWaiters are local
        // and will be garbage collected when this generator is released.
      })()
    },

    async send(messages, data, signal) {
      try {
        const stream = connection.connect(messages, data, signal)
        for await (const chunk of stream) {
          push(chunk)
        }
      } catch (err) {
        // Push a RUN_ERROR event so subscribe() consumers learn about the
        // failure through the standard AG-UI protocol, then re-throw so
        // send() callers (e.g. streamResponse) can also handle it.
        push({
          type: 'RUN_ERROR',
          timestamp: Date.now(),
          error: {
            message:
              err instanceof Error ? err.message : 'Unknown error in send()',
          },
        })
        throw err
      }
    },
  }
}
