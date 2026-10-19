import { EventType } from '@tanstack/ai'
import { isMediaRecord } from './media-ref'
import { HARNESS_EVENTS } from './types'
import { isRecord } from './utils'
import type { StreamChunk } from '@tanstack/ai'
import type {
  AuthRequest,
  Cursor,
  EventGap,
  LiveEvent,
  MediaRecord,
  OnEvent,
  PendingQuestion,
  SessionEvent,
  StreamChunkType,
  UsageUpdate,
} from './types'

/**
 * The ordered event stream of one session. Every operation publishes here.
 * A session uses a feed that keeps the events in the session log. Before its
 * log opens, it has a {@link SessionFeed} in memory.
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
  /** Let every waiting reader check `until` again, when nothing was published. */
  wake: () => void
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
      // A typed listener gets only events of its type. The result goes back,
      // so the feed can catch a promise that rejects.
      if (type === null || entry.event.type === type) {
        return (listener as EventListener)(entry)
      }
    })
  }
  return onEvent
}

/** A listener of one kind of harness event. Returns a function that stops it. */
export type OnHarnessEvent<TEntry> = (
  listener: (entry: TEntry & { operationId: string }) => void,
) => () => void

/**
 * Listen to the `CUSTOM` events named `name`. `read` turns the event value
 * into the listener entry, or returns `undefined` to skip a bad value.
 */
function onCustomOf<TEntry>(
  onEvent: OnEvent,
  name: string,
  read: (value: unknown) => TEntry | undefined,
): OnHarnessEvent<TEntry> {
  return (listener) =>
    onEvent(EventType.CUSTOM, ({ operationId, event }) => {
      if (event.name !== name) return
      const entry = read(event.value)
      // The result goes back, so the feed can catch a promise that rejects.
      if (entry !== undefined) return listener({ ...entry, operationId })
    })
}

/** The `onMedia` of a session or an operation: its `harness.media` events. */
export function onMediaOf(
  onEvent: OnEvent,
): OnHarnessEvent<{ media: MediaRecord }> {
  return onCustomOf(onEvent, HARNESS_EVENTS.media, (value) =>
    isMediaRecord(value) ? { media: value } : undefined,
  )
}

/** The `onQuestion` of a session: its `harness.question` events. */
export function onQuestionOf(
  onEvent: OnEvent,
): OnHarnessEvent<{ question: PendingQuestion }> {
  return onCustomOf(onEvent, HARNESS_EVENTS.question, (value) =>
    isPendingQuestion(value) ? { question: value } : undefined,
  )
}

/** The `onAuthRequired` of a session: its `harness.auth_required` events. */
export function onAuthRequiredOf(
  onEvent: OnEvent,
): OnHarnessEvent<AuthRequest> {
  return onCustomOf(onEvent, HARNESS_EVENTS.authRequired, (value) =>
    isAuthRequest(value) ? value : undefined,
  )
}

/** The `onUsage` of a session: its `harness.usage` events. */
export function onUsageOf(onEvent: OnEvent): OnHarnessEvent<UsageUpdate> {
  return onCustomOf(onEvent, HARNESS_EVENTS.usage, (value) =>
    isUsageUpdate(value) ? value : undefined,
  )
}

function isPendingQuestion(value: unknown): value is PendingQuestion {
  return (
    isRecord(value) &&
    typeof value.questionId === 'string' &&
    typeof value.message === 'string'
  )
}

function isAuthRequest(value: unknown): value is AuthRequest {
  return isRecord(value) && typeof value.connector === 'string'
}

function isUsageUpdate(value: unknown): value is UsageUpdate {
  return (
    isRecord(value) &&
    typeof value.model === 'string' &&
    isRecord(value.usage) &&
    isRecord(value.total)
  )
}

/**
 * The in-memory {@link EventFeed}. Cursors are opaque to callers and increase
 * with each event.
 */
// ponytail: it keeps the newest `eventBytes` of events (the JSON length of
// each). A reader whose cursor fell out of them gets a `harness.gap` event,
// then resumes from the oldest kept event. Durable cross-process delivery
// goes through StreamDurability in the protocol layer.
export class SessionFeed implements EventFeed {
  /** The kept events. Their cursors are consecutive numbers. */
  private readonly entries: Array<SessionEvent> = []
  /** The JSON length of each event in `entries`, in the same order. */
  private readonly sizes: Array<number> = []
  /** The sum of `sizes`. */
  private bytes = 0
  private readonly eventBytes: number
  private readonly threadId: string
  private sequence = 0
  private readonly waiters = new Set<() => void>()
  private closed = false

  /**
   * `threadId`: the thread of the session. `eventBytes`: how many bytes of
   * events to keep.
   */
  constructor(options: { threadId: string; eventBytes: number }) {
    this.threadId = options.threadId
    this.eventBytes = options.eventBytes
  }

  publish(operationId: string, event: StreamChunk): void {
    this.sequence += 1
    const size = jsonLength(event)
    this.entries.push({
      cursor: String(this.sequence),
      threadId: this.threadId,
      operationId,
      event,
    })
    this.sizes.push(size)
    this.bytes += size
    // The newest event stays, so a live reader still gets it.
    while (this.bytes > this.eventBytes && this.entries.length > 1) {
      this.entries.shift()
      this.bytes -= this.sizes.shift() ?? 0
    }
    this.wake()
  }

  head(): Cursor {
    return String(this.sequence)
  }

  /** The kept events after the cursor `after` that `filter` accepts. */
  private after(
    after: number,
    filter: ((entry: SessionEvent) => boolean) | undefined,
  ) {
    const first = this.sequence - this.entries.length + 1
    return this.entries
      .slice(Math.max(0, after + 1 - first))
      .filter((entry) => (filter ? filter(entry) : true))
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
      // The feed dropped events after `after`: say so once, then go on from
      // the oldest kept event.
      const oldest = this.sequence - this.entries.length + 1
      if (this.entries.length > 0 && after < oldest - 1) {
        yield gapEvent(
          this.threadId,
          String(after),
          String(oldest - 1),
          'evicted',
        )
        after = oldest - 1
      }
      const next = this.after(after, options.filter)
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
        for (const entry of this.after(after, options.filter)) yield entry
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

  wake(): void {
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

/**
 * The `harness.gap` event of thread `threadId` for a reader at `from`: the
 * events after `from` are gone, and the stream goes on after `resumeAt`, the
 * cursor of this event.
 */
export function gapEvent(
  threadId: string,
  from: Cursor,
  resumeAt: Cursor,
  reason: EventGap['reason'],
): SessionEvent {
  const value: EventGap = { from, resumeAt, reason }
  return {
    cursor: resumeAt,
    threadId,
    // No operation made it. Like a session input, it belongs to the session.
    operationId: 'session',
    event: {
      type: EventType.CUSTOM,
      name: HARNESS_EVENTS.gap,
      value,
      timestamp: Date.now(),
    },
  }
}

/**
 * The JSON length of `event`. A value that JSON cannot encode (a `BigInt`
 * from a plugin) counts as 0, so the publish does not throw.
 */
function jsonLength(event: StreamChunk) {
  try {
    return JSON.stringify(event).length
  } catch {
    return 0
  }
}
