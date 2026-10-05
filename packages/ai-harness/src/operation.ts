import type { StreamChunk } from '@tanstack/ai'
import type { EventFeed } from './feed'
import type {
  Cursor,
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

const TERMINAL: ReadonlySet<OperationStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
])

/** The session-side implementation of {@link Operation}. */
export class OperationImpl<TResult> implements Operation<TResult> {
  readonly id: string
  /** The feed head when the operation was made. Its events come after it. */
  readonly startedCursor: Cursor
  readonly abortController = new AbortController()
  readonly receipt: Promise<Receipt>
  private current: OperationStatus = 'accepted'
  private readonly settled: Promise<TResult>
  private resolveResult!: (value: TResult) => void
  private rejectResult!: (error: unknown) => void
  private settleReceipt!: (receipt: Receipt) => void

  constructor(
    readonly kind: OperationKind,
    private readonly feed: EventFeed,
    private readonly onCancel: (
      operation: OperationImpl<TResult>,
    ) => Promise<Receipt>,
    readonly agent?: string,
    /** A stored operation id, when a restart rebuilds this operation. */
    id?: string,
  ) {
    this.id = id ?? createOperationId(kind)
    this.startedCursor = feed.head()
    this.receipt = new Promise<Receipt>((resolve) => {
      this.settleReceipt = resolve
    })
    this.settled = new Promise<TResult>((resolve, reject) => {
      this.resolveResult = resolve
      this.rejectResult = reject
    })
    // Nobody may await a failed background operation. Do not report that as an
    // unhandled rejection. `then` still rejects for callers that await.
    this.settled.catch(() => {})
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
    return TERMINAL.has(this.current)
  }

  setStatus(status: OperationStatus): void {
    this.current = status
  }

  publish(event: StreamChunk): void {
    this.feed.publish(this.id, event)
  }

  /** Answer `receipt`. The first answer wins. */
  resolveReceipt(receipt: Receipt): void {
    this.settleReceipt(receipt)
  }

  finish(status: 'completed' | 'interrupted', result: TResult): void {
    this.current = status
    this.resolveResult(result)
  }

  fail(status: 'failed' | 'cancelled', error: unknown): void {
    this.current = status
    this.rejectResult(error)
  }

  events(options?: {
    from?: Cursor
    signal?: AbortSignal
  }): AsyncIterable<SessionEvent> {
    return this.feed.read({
      ...options,
      filter: (entry) => entry.operationId === this.id,
      until: () => this.isSettled(),
    })
  }

  async *stream(options?: {
    signal?: AbortSignal
  }): AsyncIterable<StreamChunk> {
    for await (const entry of this.events({ from: '0', ...options })) {
      yield entry.event
    }
  }

  cancel(_reason?: string): Promise<Receipt> {
    return this.onCancel(this)
  }
}
