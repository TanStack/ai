import type { StreamChunk } from '@tanstack/ai'
import type { Cursor, SessionEvent } from './types'

// ponytail: in-memory log capped at MAX_EVENTS per session. A reader whose
// cursor fell out of the window resumes from the oldest kept event. Durable
// cross-process delivery goes through StreamDurability in the protocol layer.
const MAX_EVENTS = 10_000

/**
 * The ordered event stream of one session. Every operation publishes here.
 * Cursors are opaque to callers and increase with each event.
 */
export class SessionFeed {
  private readonly entries: Array<SessionEvent> = []
  private sequence = 0
  private readonly waiters = new Set<() => void>()
  private closed = false

  publish(operationId: string, event: StreamChunk): SessionEvent {
    this.sequence += 1
    const entry: SessionEvent = {
      cursor: String(this.sequence),
      operationId,
      event,
    }
    this.entries.push(entry)
    if (this.entries.length > MAX_EVENTS) this.entries.shift()
    this.wake()
    return entry
  }

  /** The cursor of the newest event, or `'0'` for an empty feed. */
  head(): Cursor {
    return String(this.sequence)
  }

  /**
   * Events after `from` (exclusive), then live events until `signal` aborts
   * or the feed closes. Pass a `filter` to read one operation's events.
   */
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
