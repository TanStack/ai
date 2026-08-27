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
  const isRawAndMessagesIsArray = raw && Array.isArray(raw.messages)
  if (isRawAndMessagesIsArray) return raw
  return undefined
}

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
  ) {}

  /** Persist the current state as one combined `{ messages, resume? }` record. */
  private writeState(): void {
    const messages = [...this.lastMessages]
    const isEmptyMessagesAndNotLastResume =
      messages.length === 0 && !this.lastResume
    if (isEmptyMessagesAndNotLastResume) {
      const generation = this.generation
      this.runOperation(() => {
        if (generation !== this.generation) {
          return
        }
        return this.adapter.removeItem(this.id)
      })
      return
    }
    const generation = this.generation
    const state: ChatPersistedState = {
      messages,
      ...(this.lastResume ? { resume: this.lastResume } : {}),
    }
    this.runOperation(() => {
      if (generation !== this.generation) {
        return
      }
      return this.adapter.setItem(this.id, state)
    })
  }

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
        const isNotStateOrMessagesGenerationIsNotHydrationGeneration =
          !state || this.messagesGeneration !== hydrationGeneration
        if (isNotStateOrMessagesGenerationIsNotHydrationGeneration) {
          return
        }
        this.lastResume = state.resume ?? null
        this.lastMessages = state.messages
        this.applyMessages(state.messages)
        if (state.resume && this.applyResume) {
          this.applyResume(state.resume)
        }
      })
      .catch(() => {
        // Persistence adapters are best-effort and must not break chat setup.
      })
  }

  notifyMessagesChanged(messages: Array<UIMessage>): void {
    this.messagesGeneration++
    this.lastMessages = [...messages]
    if (this.skipNextPersist) {
      this.skipNextPersist = false
      return
    }
    this.writeState()
  }

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
    const hasClearedRunId = runId && this.clearedRunIds.has(runId)
    if (hasClearedRunId) {
      if (chunk.type === 'RUN_STARTED') {
        this.ignoredActiveRunIds.add(runId)
        this.currentRunlessRunId = runId
      }
      this.markIgnoredChunkIds(chunk)
      return true
    }

    const hasIgnoredActiveRunId = runId && this.ignoredActiveRunIds.has(runId)
    if (hasIgnoredActiveRunId) {
      this.markIgnoredChunkIds(chunk)
      return true
    }

    if (this.isRunlessChunkFromIgnoredRun(chunk)) {
      this.markIgnoredChunkIds(chunk)
      return true
    }

    const toolCallId = getChunkToolCallId(chunk)
    const hasClearedToolCallId =
      toolCallId && this.clearedToolCallIds.has(toolCallId)
    if (hasClearedToolCallId) {
      return true
    }

    const parentMessageId = getChunkParentMessageId(chunk)
    const hasClearedMessageId =
      parentMessageId && this.clearedMessageIds.has(parentMessageId)
    if (hasClearedMessageId) {
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

  takeRunlessRunId(): string | null {
    const runId = this.currentRunlessRunId
    if (!runId) return null
    this.ignoredActiveRunIds.delete(runId)
    this.clearedRunIds.delete(runId)
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
    if (runId) return false
    if (!this.currentRunlessRunId) return false
    const isUnknownRunlessId =
      !this.ignoredActiveRunIds.has(this.currentRunlessRunId) &&
      !this.clearedRunIds.has(this.currentRunlessRunId)
    if (isUnknownRunlessId) {
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
