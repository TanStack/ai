import { getChunkRunId } from './connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'
import type {
  ChatClientPersistence,
  ChatPersistedState,
  ChatResumeSnapshot,
  UIMessage,
} from './types'

/** Normalize a raw `getItem` result (legacy bare array or combined record). */
function normalizePersistedState(
  raw: ChatPersistedState | Array<UIMessage> | null | undefined,
): ChatPersistedState | undefined {
  if (Array.isArray(raw)) return { messages: raw }
  if (raw && Array.isArray(raw.messages)) return raw
  return undefined
}

// `StreamChunk` is a discriminated union; `toolCallId` / `messageId` /
// `parentMessageId` exist on only some members. Narrow with `in` (matching
// `getChunkRunId`) instead of asserting a shape, so the field's real type is
// preserved and a protocol rename can't be read past silently.
function getChunkToolCallId(chunk: StreamChunk): string | undefined {
  return 'toolCallId' in chunk && typeof chunk.toolCallId === 'string'
    ? chunk.toolCallId
    : undefined
}

function getChunkMessageId(chunk: StreamChunk): string | undefined {
  return 'messageId' in chunk && typeof chunk.messageId === 'string'
    ? chunk.messageId
    : undefined
}

function getChunkParentMessageId(chunk: StreamChunk): string | undefined {
  return 'parentMessageId' in chunk && typeof chunk.parentMessageId === 'string'
    ? chunk.parentMessageId
    : undefined
}

/**
 * Encapsulates everything persistence-related for `ChatClient` so the client
 * itself stays focused on streaming and message state.
 *
 * Two responsibilities live here:
 *
 * 1. **Storage orchestration** — hydrate from `getItem(id)` on creation, save to
 *    `setItem(id, messages)` on every change through an ordered write queue, and
 *    `removeItem(id)` on clear. A generation counter discards stale writes when a
 *    removal or a newer conversation supersedes an in-flight async operation.
 * 2. **Clear-during-stream suppression** — when a conversation is cleared while a
 *    stream is still producing, late chunks for the cleared run(s) must not
 *    repopulate the now-empty state. The persistor tracks the cleared ids and
 *    decides, per chunk, whether the client should ignore it.
 *
 * All adapter calls are best-effort: a throwing or rejecting adapter is swallowed
 * so storage problems never break the chat.
 */
export class ChatPersistor {
  // --- storage queue state ---
  private skipNextPersist = false
  private generation = 0
  private queue: Promise<void> = Promise.resolve()
  private queuePending = false
  // Bumped on every message change; lets an in-flight async hydration detect
  // that the message list moved on and avoid clobbering it.
  private messagesGeneration = 0
  // Latest messages + resume snapshot, written together as one combined record
  // so a full page reload restores both from a single adapter key.
  private lastMessages: Array<UIMessage> = []
  private lastResume: ChatResumeSnapshot | null = null

  // --- clear-during-stream suppression state ---
  private readonly clearedMessageIds = new Set<string>()
  private readonly clearedRunIds = new Set<string>()
  private readonly ignoredActiveRunIds = new Set<string>()
  private readonly clearedToolCallIds = new Set<string>()
  private currentRunlessRunId: string | null = null

  constructor(
    private readonly adapter: ChatClientPersistence,
    private readonly id: string,
    private readonly applyMessages: (messages: Array<UIMessage>) => void,
    private readonly applyResume?: (snapshot: ChatResumeSnapshot) => void,
    // When false, the transcript is never cached client-side; only the tiny
    // resume pointer is persisted (server-authoritative history). Defaults true.
    private readonly storeMessages: boolean = true,
  ) {}

  /**
   * Persist the current state as one combined record. When `storeMessages` is
   * false the transcript is omitted (empty), so only the resume pointer is
   * written and large histories never hit client storage.
   */
  private writeState(): void {
    const generation = this.generation
    const state: ChatPersistedState = {
      messages: this.storeMessages ? [...this.lastMessages] : [],
      ...(this.lastResume ? { resume: this.lastResume } : {}),
    }
    this.runOperation(() => {
      if (generation !== this.generation) {
        return
      }
      return this.adapter.setItem(this.id, state)
    })
  }

  // ---------------------------------------------------------------------------
  // Storage orchestration
  // ---------------------------------------------------------------------------

  /**
   * Synchronously read the persisted state for constructor-time hydration.
   * Returns the normalized combined record, or a promise of it for async stores.
   */
  readInitial():
    | ChatPersistedState
    | undefined
    | Promise<ChatPersistedState | undefined> {
    try {
      const raw = this.adapter.getItem(this.id)
      if (raw instanceof Promise) {
        return raw.then(normalizePersistedState).catch(() => undefined)
      }
      const state = normalizePersistedState(raw)
      if (state) {
        this.lastMessages = state.messages
        this.lastResume = state.resume ?? null
      }
      return state
    } catch {
      return undefined
    }
  }

  /**
   * Apply state from an async `getItem` once it resolves, unless the message
   * list has already changed since hydration began.
   */
  hydrateAsync(
    persistedState:
      | ChatPersistedState
      | undefined
      | Promise<ChatPersistedState | undefined>,
  ): void {
    if (!(persistedState instanceof Promise)) {
      return
    }

    const hydrationGeneration = this.messagesGeneration
    persistedState
      .then((state) => {
        if (!state || this.messagesGeneration !== hydrationGeneration) {
          return
        }
        this.lastResume = state.resume ?? null
        // Only apply the persisted transcript when we cache it. In
        // `messages: false` mode the record's empty `messages` must not wipe
        // host-provided initialMessages; still apply the resume snapshot.
        if (this.storeMessages) {
          this.lastMessages = state.messages
          this.applyMessages(state.messages)
        }
        if (state.resume && this.applyResume) {
          this.applyResume(state.resume)
        }
      })
      .catch(() => {
        // Persistence adapters are best-effort and must not break chat setup.
      })
  }

  /**
   * Record a message-list change and queue a combined write for it. Skips a
   * single write after {@link beginClear} so the clear's empty snapshot isn't
   * persisted between `clearMessages()` and {@link remove}.
   */
  notifyMessagesChanged(messages: Array<UIMessage>): void {
    this.messagesGeneration++
    this.lastMessages = [...messages]
    if (this.skipNextPersist) {
      this.skipNextPersist = false
      return
    }
    this.writeState()
  }

  /**
   * Record the current resume snapshot (which run to rejoin / which interrupts
   * are pending) and persist it alongside the messages. Pass `null` to clear it
   * once the run reaches a non-interrupt terminal.
   */
  persistResumeSnapshot(snapshot: ChatResumeSnapshot | null): void {
    this.lastResume = snapshot
    if (this.skipNextPersist) {
      return
    }
    this.writeState()
  }

  /** Remove the persisted conversation. Invalidates any queued writes. */
  remove(): void {
    this.lastMessages = []
    this.lastResume = null
    const generation = ++this.generation
    this.runOperation(() => {
      if (generation !== this.generation) {
        return
      }
      return this.adapter.removeItem(this.id)
    })
  }

  private runOperation(operation: () => void | Promise<void>): void {
    if (this.queuePending) {
      const queued = this.queue.then(operation).catch(() => {
        // Persistence adapters are best-effort and must not break chat updates.
      })
      this.queue = queued
      void queued.finally(() => {
        if (this.queue === queued) {
          this.queuePending = false
        }
      })
      return
    }

    try {
      const result = operation()
      if (result instanceof Promise) {
        this.queuePending = true
        const queued = result.catch(() => {
          // Persistence adapters are best-effort and must not break chat updates.
        })
        this.queue = queued
        void queued.finally(() => {
          if (this.queue === queued) {
            this.queuePending = false
          }
        })
      }
    } catch {
      // Persistence adapters are best-effort and must not break chat updates.
    }
  }

  // ---------------------------------------------------------------------------
  // Clear-during-stream suppression
  // ---------------------------------------------------------------------------

  /**
   * Capture the message/run ids that exist at the moment of a clear so chunks
   * still arriving for them can be ignored.
   */
  snapshotClear(context: {
    messages: Array<UIMessage>
    activeRunIds: Set<string>
    currentRunId: string | null
  }): void {
    for (const message of context.messages) {
      this.clearedMessageIds.add(message.id)
    }
    for (const runId of context.activeRunIds) {
      this.clearedRunIds.add(runId)
      this.ignoredActiveRunIds.add(runId)
    }
    if (context.currentRunId) {
      this.clearedRunIds.add(context.currentRunId)
      this.ignoredActiveRunIds.add(context.currentRunId)
    }
  }

  /** Mark that the next persisted message change (the clear itself) is skipped. */
  beginClear(): void {
    this.skipNextPersist = true
  }

  /** Whether a chunk belongs to cleared state and should not be processed. */
  shouldIgnoreChunk(chunk: StreamChunk): boolean {
    const runId = getChunkRunId(chunk)
    if (runId && this.clearedRunIds.has(runId)) {
      if (chunk.type === 'RUN_STARTED') {
        this.ignoredActiveRunIds.add(runId)
        this.currentRunlessRunId = runId
      }
      this.markIgnoredChunkIds(chunk)
      return true
    }

    if (runId && this.ignoredActiveRunIds.has(runId)) {
      this.markIgnoredChunkIds(chunk)
      return true
    }

    if (this.isRunlessChunkFromIgnoredRun(chunk)) {
      this.markIgnoredChunkIds(chunk)
      return true
    }

    const toolCallId = getChunkToolCallId(chunk)
    if (toolCallId && this.clearedToolCallIds.has(toolCallId)) {
      return true
    }

    const parentMessageId = getChunkParentMessageId(chunk)
    if (parentMessageId && this.clearedMessageIds.has(parentMessageId)) {
      if (toolCallId) {
        this.clearedToolCallIds.add(toolCallId)
      }
      return true
    }

    const messageId = getChunkMessageId(chunk)
    if (!messageId) {
      return false
    }
    if (this.clearedMessageIds.has(messageId)) {
      return true
    }

    return false
  }

  /**
   * The owning client calls this when a run starts so runless content chunks
   * (adapters that omit `runId` on content events) can be attributed to it.
   */
  onRunStarted(runId: string): void {
    this.currentRunlessRunId = runId
  }

  /** Forget a settled run, advancing the runless pointer to another ignored run. */
  onRunSettled(runId: string): void {
    this.ignoredActiveRunIds.delete(runId)
    this.clearedRunIds.delete(runId)
    if (this.currentRunlessRunId === runId) {
      this.currentRunlessRunId =
        this.ignoredActiveRunIds.values().next().value ?? null
    }
  }

  /** A session-level (runId-less) RUN_ERROR clears all ignored-run tracking. */
  onSessionRunError(): void {
    this.ignoredActiveRunIds.clear()
    this.currentRunlessRunId = null
  }

  /** Clear the ignored-active-run markers (mirrors a session-generating reset). */
  resetIgnored(): void {
    this.ignoredActiveRunIds.clear()
  }

  /**
   * Consume the current runless run id (if any), forgetting it. Used when an
   * ignored, runId-less RUN_ERROR drains the run the client is still tracking.
   */
  takeRunlessRunId(): string | null {
    const runId = this.currentRunlessRunId
    if (!runId) return null
    this.ignoredActiveRunIds.delete(runId)
    this.clearedRunIds.delete(runId)
    // Advance to another still-ignored run (mirroring `onRunSettled`) so that
    // when two cleared runs drain concurrently, draining one via a runId-less
    // RUN_ERROR doesn't stop suppressing the other's runless content.
    this.currentRunlessRunId =
      this.ignoredActiveRunIds.values().next().value ?? null
    return runId
  }

  private markIgnoredChunkIds(chunk: StreamChunk): void {
    const messageId = getChunkMessageId(chunk)
    if (messageId) {
      this.clearedMessageIds.add(messageId)
    }
    const toolCallId = getChunkToolCallId(chunk)
    if (toolCallId) {
      this.clearedToolCallIds.add(toolCallId)
    }
  }

  private isRunlessChunkFromIgnoredRun(chunk: StreamChunk): boolean {
    const runId = getChunkRunId(chunk)
    if (runId || !this.currentRunlessRunId) return false
    if (
      !this.ignoredActiveRunIds.has(this.currentRunlessRunId) &&
      !this.clearedRunIds.has(this.currentRunlessRunId)
    ) {
      return false
    }
    return (
      chunk.type === 'TEXT_MESSAGE_START' ||
      chunk.type === 'TEXT_MESSAGE_CONTENT' ||
      chunk.type === 'TOOL_CALL_START' ||
      chunk.type === 'TOOL_CALL_ARGS' ||
      chunk.type === 'TOOL_CALL_END' ||
      chunk.type === 'TOOL_CALL_RESULT' ||
      chunk.type === 'MESSAGES_SNAPSHOT' ||
      chunk.type === 'RUN_ERROR'
    )
  }
}
