import { EventType } from '@tanstack/ai'
import { isMediaRecord } from './media-ref'
import { HARNESS_EVENTS } from './types'
import type { StreamChunk } from '@tanstack/ai'
import type {
  Cursor,
  LiveEvent,
  MediaRecord,
  OnEvent,
  SessionEvent,
  StreamChunkType,
} from './types'

// ponytail: in-memory log capped at MAX_EVENTS per session. A reader whose
// cursor fell out of the window resumes from the oldest kept event. Durable
// cross-process delivery goes through StreamDurability in the protocol layer.
const MAX_EVENTS = 10_000

/**
 * The ordered event stream of one session. Every operation publishes here. A
 * host without a log uses {@link SessionFeed}. A durable host uses a feed
 * that keeps the events in the session log.
 */
export interface EventFeed {
  publish: (operationId: string, event: StreamChunk) => void
  /** The cursor of the newest event, or `'0'` for an empty feed. */
  head: () => Cursor
  /**
   * Events after `from` (exclusive), then live events until `signal` aborts
   * or the feed closes. Pass a `filter` to read one operation's events.
   */
  read: (options: {
    from?: Cursor
    signal?: AbortSignal
    filter?: (entry: SessionEvent) => boolean
    /** Stop after `until()` returns true and no buffered event is left. */
    until?: () => boolean
  }) => AsyncIterable<SessionEvent>
  close: () => void
}

/** A listener of the events a session publishes. */
export type EventListener = (entry: LiveEvent) => void

/** An {@link EventFeed} that also calls listeners after each publish. */
export interface ListenedFeed extends EventFeed {
  /** Add `listener`. Returns a function that removes it. */
  listen: (listener: EventListener) => () => void
}

/**
 * The `onEvent` of a session, or of one operation when `operationId` is set.
 * `listen` adds a listener to the feed.
 */
export function onEventOf(
  listen: (listener: EventListener) => () => void,
  operationId?: string,
): OnEvent {
  function onEvent(listener: EventListener): () => void
  function onEvent(
    type: StreamChunkType,
    listener: (entry: LiveEvent<never>) => void,
  ): () => void
  function onEvent(
    typeOrListener: StreamChunkType | EventListener,
    typed?: (entry: LiveEvent<never>) => void,
  ): () => void {
    const type = typeof typeOrListener === 'string' ? typeOrListener : null
    const listener = typeof typeOrListener === 'string' ? typed : typeOrListener
    if (typeof listener !== 'function') {
      throw new TypeError('onEvent needs a listener function.')
    }
    return listen((entry) => {
      if (operationId !== undefined && entry.operationId !== operationId) {
        return
      }
      // A typed listener gets only events of its type.
      if (type === null || entry.event.type === type) {
        ;(listener as EventListener)(entry)
      }
    })
  }
  return onEvent
}

/** The `onMedia` of an operation: its `harness.media` events. */
export function onMediaOf(
  onEvent: OnEvent,
): (listener: (entry: { media: MediaRecord }) => void) => () => void {
  return (listener) =>
    onEvent(EventType.CUSTOM, ({ event }) => {
      if (event.name === HARNESS_EVENTS.media && isMediaRecord(event.value)) {
        listener({ media: event.value })
      }
    })
}

/**
 * The in-memory {@link EventFeed}. Cursors are opaque to callers and increase
 * with each event.
 */
export class SessionFeed implements EventFeed {
  private readonly entries: Array<SessionEvent> = []
  private sequence = 0
  private readonly waiters = new Set<() => void>()
  private closed = false

  publish(operationId: string, event: StreamChunk): void {
    this.sequence += 1
    this.entries.push({ cursor: String(this.sequence), operationId, event })
    if (this.entries.length > MAX_EVENTS) this.entries.shift()
    this.wake()
  }

  head(): Cursor {
    return String(this.sequence)
  }

  async *read(options: {
    from?: Cursor
    signal?: AbortSignal
    filter?: (entry: SessionEvent) => boolean
    /** Stop after `until()` returns true and no buffered event is left. */
    until?: () => boolean
  }): AsyncIterable<SessionEvent> {
    let after = Number(options.from ?? '0')
    if (!Number.isFinite(after)) after = 0
    while (true) {
      if (options.signal?.aborted) return
      const next = this.entries.filter(
        (entry) =>
          Number(entry.cursor) > after &&
          (options.filter ? options.filter(entry) : true),
      )
      for (const entry of next) {
        if (options.signal?.aborted) return
        after = Number(entry.cursor)
        yield entry
      }
      if (next.length === 0) {
        // Skip past events the filter rejected, so they are not scanned again.
        after = Math.max(after, this.sequence)
      }
      if (this.closed || options.until?.()) {
        const rest = this.entries.filter(
          (entry) =>
            Number(entry.cursor) > after &&
            (options.filter ? options.filter(entry) : true),
        )
        for (const entry of rest) yield entry
        return
      }
      // Events published while the reader handled `next` woke nobody, so
      // scan again before waiting. An empty scan moves `after` to the head.
      if (next.length > 0) continue
      await this.waitForNext(options.signal)
    }
  }

  close(): void {
    this.closed = true
    this.wake()
  }

  private wake(): void {
    const waiters = [...this.waiters]
    this.waiters.clear()
    for (const wake of waiters) wake()
  }

  private waitForNext(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve()
      const done = () => {
        signal?.removeEventListener('abort', done)
        this.waiters.delete(done)
        resolve()
      }
      this.waiters.add(done)
      signal?.addEventListener('abort', done, { once: true })
    })
  }
}
