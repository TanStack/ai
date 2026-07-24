import { getChunkRunId } from './connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'
import type { UIMessage } from './types'

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

/** Tracks stream chunks that must be ignored after the owning chat is cleared. */
export class ClearedStreamTracker {
  private readonly clearedMessageIds = new Set<string>()
  private readonly clearedRunIds = new Set<string>()
  private readonly ignoredActiveRunIds = new Set<string>()
  private readonly clearedToolCallIds = new Set<string>()
  private currentRunlessRunId: string | null = null

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
    return Boolean(messageId && this.clearedMessageIds.has(messageId))
  }

  onRunStarted(runId: string): void {
    this.currentRunlessRunId = runId
  }

  onRunSettled(runId: string): void {
    this.ignoredActiveRunIds.delete(runId)
    this.clearedRunIds.delete(runId)
    if (this.currentRunlessRunId === runId) {
      this.currentRunlessRunId =
        this.ignoredActiveRunIds.values().next().value ?? null
    }
  }

  onSessionRunError(): void {
    this.ignoredActiveRunIds.clear()
    this.currentRunlessRunId = null
  }

  resetActiveRuns(): void {
    this.ignoredActiveRunIds.clear()
    this.currentRunlessRunId = null
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
