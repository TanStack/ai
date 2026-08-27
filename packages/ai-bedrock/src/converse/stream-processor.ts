import { EventType } from '@tanstack/ai'
import type { AdapterYieldChunk } from '@tanstack/ai'
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime'

function usageFromMetadata(
  ev: ConverseStreamOutput,
):
  | { promptTokens: number; completionTokens: number; totalTokens: number }
  | undefined {
  if (!('metadata' in ev)) return undefined
  const u = ev.metadata?.usage
  if (!u) return undefined
  return {
    promptTokens: u.inputTokens ?? 0,
    completionTokens: u.outputTokens ?? 0,
    totalTokens: u.totalTokens ?? 0,
  }
}

function mapConverseStopReason(
  stopReason: string | undefined,
): NonNullable<AdapterYieldChunk['finishReason']> {
  if (stopReason === 'tool_use') return 'tool_calls'
  if (stopReason === 'max_tokens') return 'length'
  if (stopReason === 'content_filtered') return 'content_filter'
  return 'stop'
}

export function throwIfConverseStreamError(ev: ConverseStreamOutput): void {
  if ('internalServerException' in ev && ev.internalServerException) {
    throw ev.internalServerException
  }
  if ('modelStreamErrorException' in ev && ev.modelStreamErrorException) {
    throw ev.modelStreamErrorException
  }
  if ('validationException' in ev && ev.validationException) {
    throw ev.validationException
  }
  if ('throttlingException' in ev && ev.throttlingException) {
    throw ev.throttlingException
  }
  if ('serviceUnavailableException' in ev && ev.serviceUnavailableException) {
    throw ev.serviceUnavailableException
  }
}

export async function* processConverseStream(
  stream: AsyncIterable<ConverseStreamOutput>,
  newMessageId: () => string,
  lifecycle: { threadId?: string; parentRunId?: string; model?: string } = {},
): AsyncIterable<AdapterYieldChunk> {
  const runId = newMessageId()
  const threadId = lifecycle.threadId ?? newMessageId()
  const { parentRunId, model } = lifecycle
  const messageId = newMessageId()

  let hasEmittedRunStarted = false

  // Text lifecycle
  let accumulatedContent = ''
  let hasEmittedTextMessageStart = false

  // Reasoning lifecycle
  let reasoningMessageId: string | undefined
  let hasClosedReasoning = false

  const toolCallsByIndex = new Map<
    number,
    { id: string; name: string; started: boolean }
  >()

  let usage:
    | { promptTokens: number; completionTokens: number; totalTokens: number }
    | undefined
  let finishReason: NonNullable<AdapterYieldChunk['finishReason']> | undefined

  // Lazily emit RUN_STARTED exactly once, before the first content event.
  function* ensureRunStarted(): Generator<AdapterYieldChunk> {
    if (hasEmittedRunStarted) return
    hasEmittedRunStarted = true
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      parentRunId,
      ...(model && { model }),
      timestamp: Date.now(),
    }
  }

  // Close an open reasoning message before text/tool content begins, mirroring
  // openai-base which always emits REASONING_MESSAGE_END before TEXT_MESSAGE_START.
  function* closeReasoning(): Generator<AdapterYieldChunk> {
    if (reasoningMessageId && !hasClosedReasoning) {
      hasClosedReasoning = true
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningMessageId,
        timestamp: Date.now(),
      }
    }
  }

  function* handleContentBlockStart(
    ev: Extract<ConverseStreamOutput, { contentBlockStart?: unknown }>,
  ): Generator<AdapterYieldChunk> {
    const start = ev.contentBlockStart
    const toolUse = start?.start?.toolUse
    if (!start) return
    if (!toolUse) return
    yield* closeReasoning()
    const id = toolUse.toolUseId ?? newMessageId()
    const name = toolUse.name ?? ''
    const index = start.contentBlockIndex ?? 0
    toolCallsByIndex.set(index, {
      id,
      name,
      started: true,
    })
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: id,
      toolCallName: name,
      toolName: name,
      timestamp: Date.now(),
      index,
    }
  }

  function* handleContentBlockDelta(
    ev: Extract<ConverseStreamOutput, { contentBlockDelta?: unknown }>,
  ): Generator<AdapterYieldChunk> {
    const block = ev.contentBlockDelta
    const delta = block?.delta
    const index = block?.contentBlockIndex ?? 0

    if (delta && 'toolUse' in delta && delta.toolUse?.input !== undefined) {
      const toolCall = toolCallsByIndex.get(index)
      if (toolCall?.started) {
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: toolCall.id,
          timestamp: Date.now(),
          delta: delta.toolUse.input,
        }
      }
      return
    }

    if (
      delta &&
      'reasoningContent' in delta &&
      delta.reasoningContent &&
      'text' in delta.reasoningContent &&
      delta.reasoningContent.text !== undefined
    ) {
      if (!reasoningMessageId) {
        reasoningMessageId = newMessageId()
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: reasoningMessageId,
          role: 'reasoning',
          timestamp: Date.now(),
        }
      }
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningMessageId,
        delta: delta.reasoningContent.text,
        timestamp: Date.now(),
      }
      return
    }

    if (delta && 'text' in delta && delta.text !== undefined) {
      yield* closeReasoning()
      if (!hasEmittedTextMessageStart) {
        hasEmittedTextMessageStart = true
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
          timestamp: Date.now(),
        }
      }
      accumulatedContent += delta.text
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: delta.text,
        content: accumulatedContent,
        timestamp: Date.now(),
      }
    }
  }

  function* handleContentBlockStop(
    ev: Extract<ConverseStreamOutput, { contentBlockStop?: unknown }>,
  ): Generator<AdapterYieldChunk> {
    const stopIndex = ev.contentBlockStop?.contentBlockIndex ?? 0
    const toolCall = toolCallsByIndex.get(stopIndex)
    if (!toolCall?.started) return
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      toolName: toolCall.name,
      timestamp: Date.now(),
    }
    toolCallsByIndex.delete(stopIndex)
  }

  for await (const ev of stream) {
    yield* ensureRunStarted()

    // Surface in-band server/throttle/validation errors instead of dropping them.
    throwIfConverseStreamError(ev)

    // messageStart carries only the role; no AG-UI event maps to it.
    if ('messageStart' in ev) continue

    if ('contentBlockStart' in ev) {
      yield* handleContentBlockStart(ev)
      continue
    }

    if ('contentBlockDelta' in ev) {
      yield* handleContentBlockDelta(ev)
      continue
    }

    if ('contentBlockStop' in ev) {
      yield* handleContentBlockStop(ev)
      continue
    }

    if ('messageStop' in ev) {
      finishReason = mapConverseStopReason(ev.messageStop?.stopReason)
      continue
    }

    if ('metadata' in ev) {
      usage = usageFromMetadata(ev) ?? usage
      continue
    }
  }

  // Stream ended (possibly without any content) — still emit RUN_STARTED so
  // consumers always see a run lifecycle.
  yield* ensureRunStarted()

  // Drain any tool call that opened but never received contentBlockStop.
  for (const [index, toolCall] of toolCallsByIndex) {
    if (!toolCall.started) continue
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      toolName: toolCall.name,
      timestamp: Date.now(),
    }
    toolCallsByIndex.delete(index)
  }

  // Close the text message lifecycle if it was opened.
  if (hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    }
  }

  // Close any reasoning lifecycle that text never closed.
  yield* closeReasoning()

  // Single terminal RUN_FINISHED. Conditional `usage` spread keeps the wire
  // shape spec-compliant (AG-UI's `usage` is optional with no `| undefined`).
  yield {
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    timestamp: Date.now(),
    finishReason: finishReason ?? 'stop',
    ...(usage && { usage }),
  }
}
