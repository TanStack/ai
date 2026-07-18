import type { AnyClientTool } from '@tanstack/ai/client'
import type {
  ChatClientPersistence,
  ChatResumeSnapshot,
  ChatServerPersistence,
  UIMessage,
} from './types'

type MaybePromise<T> = T | Promise<T>

interface ChatPersistenceControllerOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
> {
  chatId: string
  threadId: string
  messageAdapter?: ChatClientPersistence<TTools>
  resumeAdapter?: ChatServerPersistence
  applyMessages: (messages: Array<UIMessage<TTools>>) => void
  applyResumeSnapshot: (snapshot: ChatResumeSnapshot) => void
  canHydrateResume: () => boolean
  reportResumeError: (error: unknown) => void
  reportPersistenceError: (error: unknown) => void
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

/** Internal persistence coordinator used by ChatClient. */
export class ChatPersistenceController<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
> {
  private messageHydrationGeneration = 0
  private messageOperationGeneration = 0
  private readonly messageOperations: Array<
    () => MaybePromise<void | undefined>
  > = []
  private messageOperationPending = false
  private skipNextMessagePersist = false
  // Set when the initial message read fails (sync throw or async rejection).
  // While set, no `setItem` is attempted so a transient read failure — e.g. a
  // corrupt stored JSON blob that throws inside `getItem`/`deserialize` — can't
  // clobber the on-disk history with the fresh (empty) session. Cleared only by
  // an explicit user reset (`removeMessages`, i.e. `clear()`), which deletes the
  // stored copy outright and makes subsequent writes safe again.
  private messageWritesSuspended = false

  private resumeGeneration = 0
  private desiredResumeSnapshot: ChatResumeSnapshot | null = null
  private resumeOperationPending = false
  private disposed = false

  constructor(
    private readonly options: ChatPersistenceControllerOptions<TTools>,
  ) {}

  readInitialMessages():
    | Array<UIMessage<TTools>>
    | null
    | undefined
    | Promise<Array<UIMessage<TTools>> | null | undefined> {
    try {
      return this.options.messageAdapter?.getItem(this.options.chatId)
    } catch (error) {
      // A failed read must not silently start an empty chat AND then let the
      // next `messagesChanged` overwrite the stored history. Report it and
      // suspend writes until an explicit reset.
      this.options.reportPersistenceError(error)
      this.messageWritesSuspended = true
      return undefined
    }
  }

  hydrateMessages(
    stored:
      | Array<UIMessage<TTools>>
      | null
      | undefined
      | Promise<Array<UIMessage<TTools>> | null | undefined>,
  ): void {
    if (!isPromiseLike<Array<UIMessage<TTools>> | null | undefined>(stored)) {
      return
    }

    const generation = this.messageHydrationGeneration
    void Promise.resolve(stored)
      .then((messages) => {
        if (
          !this.disposed &&
          Array.isArray(messages) &&
          generation === this.messageHydrationGeneration
        ) {
          this.options.applyMessages(messages)
        }
      })
      .catch((error: unknown) => {
        // An async read that rejects (e.g. IndexedDB open failure, or a
        // deserialize throw in a Promise-returning adapter) is the same hazard
        // as a sync throw: report it and suspend writes so we don't overwrite
        // the stored history with the fresh session.
        this.options.reportPersistenceError(error)
        this.messageWritesSuspended = true
      })
  }

  messagesChanged(messages: Array<UIMessage<TTools>>): void {
    this.messageHydrationGeneration++
    if (this.disposed || !this.options.messageAdapter) {
      return
    }
    if (this.skipNextMessagePersist) {
      this.skipNextMessagePersist = false
      return
    }
    if (this.messageWritesSuspended) {
      // Initial read failed; refuse to persist so we can't destroy the stored
      // copy. A later reload with working storage can still recover it.
      return
    }

    const generation = this.messageOperationGeneration
    const snapshot = [...messages]
    this.runMessageOperation(() => {
      if (this.disposed || generation !== this.messageOperationGeneration) {
        return
      }
      return this.options.messageAdapter?.setItem(this.options.chatId, snapshot)
    })
  }

  prepareMessagesClear(): void {
    this.skipNextMessagePersist = true
  }

  removeMessages(): void {
    if (this.disposed || !this.options.messageAdapter) {
      return
    }
    // An explicit reset (clear()) deletes the stored copy outright, so there is
    // nothing left to protect — resume normal persistence for the fresh chat.
    this.messageWritesSuspended = false

    const generation = ++this.messageOperationGeneration
    this.runMessageOperation(() => {
      if (this.disposed || generation !== this.messageOperationGeneration) {
        return
      }
      return this.options.messageAdapter?.removeItem(this.options.chatId)
    })
  }

  readInitialResumeSnapshot():
    | ChatResumeSnapshot
    | null
    | undefined
    | Promise<ChatResumeSnapshot | null | undefined> {
    try {
      return this.options.resumeAdapter?.getItem(this.options.threadId)
    } catch (error) {
      this.options.reportResumeError(error)
      return undefined
    }
  }

  hydrateResumeSnapshot(
    stored:
      | ChatResumeSnapshot
      | null
      | undefined
      | Promise<ChatResumeSnapshot | null | undefined>,
  ): void {
    if (!isPromiseLike<ChatResumeSnapshot | null | undefined>(stored)) {
      return
    }

    const generation = this.resumeGeneration
    void Promise.resolve(stored)
      .then((snapshot) => {
        if (
          snapshot &&
          !this.disposed &&
          generation === this.resumeGeneration &&
          this.options.canHydrateResume()
        ) {
          this.options.applyResumeSnapshot(snapshot)
        }
      })
      .catch((error: unknown) => {
        this.options.reportResumeError(error)
      })
  }

  persistResumeSnapshot(snapshot: ChatResumeSnapshot | null): void {
    this.resumeGeneration++
    this.desiredResumeSnapshot = snapshot
      ? {
          resumeState: { ...snapshot.resumeState },
          pendingInterrupts: [...(snapshot.pendingInterrupts ?? [])],
        }
      : null
    this.flushResumeSnapshot()
  }

  dispose(): void {
    this.disposed = true
    this.messageHydrationGeneration++
    this.messageOperationGeneration++
    this.resumeGeneration++
  }

  private runMessageOperation(
    operation: () => MaybePromise<void | undefined>,
  ): void {
    this.messageOperations.push(operation)
    this.drainMessageOperations()
  }

  private drainMessageOperations(): void {
    while (!this.messageOperationPending) {
      const operation = this.messageOperations.shift()
      if (!operation) {
        return
      }

      this.messageOperationPending = true
      try {
        const result = operation()
        if (isPromiseLike(result)) {
          void Promise.resolve(result)
            .catch((error: unknown) => {
              // Best-effort: a write failure must not break chat, but it must
              // not vanish either.
              this.options.reportPersistenceError(error)
            })
            .then(() => {
              this.messageOperationPending = false
              this.drainMessageOperations()
            })
          return
        }
        this.messageOperationPending = false
      } catch (error) {
        this.messageOperationPending = false
        this.options.reportPersistenceError(error)
      }
    }
  }

  private flushResumeSnapshot(): void {
    if (
      this.disposed ||
      this.resumeOperationPending ||
      !this.options.resumeAdapter
    ) {
      return
    }

    const generation = this.resumeGeneration
    const snapshot = this.desiredResumeSnapshot
    this.resumeOperationPending = true

    let result: void | Promise<void>
    try {
      result = snapshot
        ? this.options.resumeAdapter.setItem(this.options.threadId, snapshot)
        : this.options.resumeAdapter.removeItem(this.options.threadId)
    } catch (error) {
      this.options.reportResumeError(error)
      this.finishResumeOperation(generation)
      return
    }

    if (!isPromiseLike(result)) {
      this.finishResumeOperation(generation)
      return
    }

    void Promise.resolve(result)
      .catch((error: unknown) => {
        this.options.reportResumeError(error)
      })
      .then(() => {
        this.finishResumeOperation(generation)
      })
  }

  private finishResumeOperation(generation: number): void {
    this.resumeOperationPending = false
    if (!this.disposed && generation !== this.resumeGeneration) {
      this.flushResumeSnapshot()
    }
  }
}
