import type { StreamChunk } from '@tanstack/ai'
import { onEventOf, onMediaOf } from './feed'
import type { ListenedFeed } from './feed'
import type {
  Cursor,
  MediaRecord,
  OnEvent,
  Operation,
  OperationKind,
  OperationStatus,
  Receipt,
  SessionEvent,
} from './types'

let counter = 0

/** A new operation id. It is also the AG-UI `runId` of the operation. */
export function createOperationId(kind: OperationKind): string {
  counter += 1
  return `op-${kind}-${Date.now().toString(36)}-${counter}`
}

/** The session-side implementation of {@link Operation}. */
export class OperationImpl<TResult> implements Operation<TResult> {
  readonly id: string
  /**
   * The feed head when the operation was made. Its events come after it. A
   * rebuilt operation gets the start of its run in the log.
   */
  readonly startedCursor: Cursor
  readonly abortController = new AbortController()
  readonly receipt: Promise<Receipt>
  private current: OperationStatus = 'accepted'
  /**
   * The result is set. An agent run that waits is `interrupted`, but it
   * does not end until an answer resumes it.
   */
  private ended = false
  private readonly settled: Promise<TResult>
  private resolveResult!: (value: TResult) => void
  private rejectResult!: (error: unknown) => void
  private settleReceipt!: (receipt: Receipt) => void
  readonly onEvent: OnEvent
  readonly onMedia: (
    listener: (entry: { media: MediaRecord }) => void,
  ) => () => void

  constructor(
    readonly kind: OperationKind,
    private readonly feed: ListenedFeed,
    private readonly onCancel: (
      operation: OperationImpl<TResult>,
    ) => Promise<Receipt>,
    readonly agent?: string,
    /** A stored operation id, when a restart rebuilds this operation. */
    id?: string,
    /** The cursor before the first event of a rebuilt operation. */
    startedCursor?: Cursor,
  ) {
    this.id = id ?? createOperationId(kind)
    this.startedCursor = startedCursor ?? feed.head()
    // A settled operation sends no more events, so a listener is not added,
    // and its listeners go once it settled. After a tick, so the events it
    // sends as it settles (the finished event) still reach them.
    const stops = new Set<() => void>()
    this.onEvent = onEventOf((listener) => {
      if (this.isSettled()) return () => {}
      const stop = feed.listen(listener)
      stops.add(stop)
      return () => {
        stops.delete(stop)
        stop()
      }
    }, this.id)
    const dropListeners = () => {
      const timer = setTimeout(() => {
        for (const stop of stops) stop()
        stops.clear()
      }, 0)
      // The timer must not keep a CLI or a test process alive.
      if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    }
    this.onMedia = onMediaOf(this.onEvent)
    this.receipt = new Promise<Receipt>((resolve) => {
      this.settleReceipt = resolve
    })
    this.settled = new Promise<TResult>((resolve, reject) => {
      this.resolveResult = resolve
      this.rejectResult = reject
    })
    // Nobody may await a failed background operation. Do not report that as an
    // unhandled rejection. `then` still rejects for callers that await.
    this.settled.then(dropListeners, dropListeners)
  }

  then<TResult1 = TResult, TResult2 = never>(
    onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.settled.then(onfulfilled, onrejected)
  }

  status(): OperationStatus {
    return this.current
  }

  isSettled(): boolean {
    return this.ended
  }

  /** Set the status. A settled operation keeps its final status. */
  setStatus(status: OperationStatus): void {
    if (this.isSettled()) return
    this.current = status
  }

  publish(event: StreamChunk): void {
    this.feed.publish(this.id, event)
  }

  /** Answer `receipt`. The first answer wins. */
  resolveReceipt(receipt: Receipt): void {
    this.settleReceipt(receipt)
  }

  /**
   * Settle with `result`. The first settle wins: when the operation settled
   * already, this call does nothing.
   */
  finish(status: 'completed' | 'interrupted', result: TResult): void {
    if (this.isSettled()) return
    this.current = status
    this.ended = true
    this.resolveResult(result)
    // A reader of `events()` waits for the next event: it ends now instead.
    this.feed.wake()
  }

  /**
   * Settle with `error`. The first settle wins: when the operation settled
   * already, this call does nothing.
   */
  fail(status: 'failed' | 'cancelled', error: unknown): void {
    if (this.isSettled()) return
    this.current = status
    this.ended = true
    this.rejectResult(error)
    this.feed.wake()
  }

  events(options?: {
    from?: Cursor
    signal?: AbortSignal
  }): AsyncIterable<SessionEvent> {
    return this.feed.read({
      ...options,
      // Every event of this operation comes after its start, so the read
      // does not walk the older events of the feed.
      from: options?.from ?? this.startedCursor,
      filter: (entry) => entry.operationId === this.id,
      until: () => this.isSettled(),
    })
  }

  async *stream(options?: {
    signal?: AbortSignal
  }): AsyncIterable<StreamChunk> {
    for await (const entry of this.events(options)) {
      yield entry.event
    }
  }

  cancel(_reason?: string): Promise<Receipt> {
    return this.onCancel(this)
  }
}
