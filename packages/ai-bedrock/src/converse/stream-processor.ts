import { EventType } from '@tanstack/ai'
import type { RunFinishedEvent, StreamChunk } from '@tanstack/ai'
import type { ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime'

/**
 * Converse delivers server-side failures — throttling, request validation,
 * mid-stream model faults, and service-unavailable — as in-band stream events
 * rather than thrown exceptions. If they were ignored the iterator would simply
 * end and the run would look like a clean, truncated success. Throw the
 * underlying exception (these SDK members extend `Error`) so the adapter's
 * `chatStream` / `structuredOutputStream` catch converts it into a `RUN_ERROR`.
 */
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

/**
 * Maps a Bedrock Converse `ConverseStreamOutput` event stream to the TanStack
 * AG-UI `StreamChunk` lifecycle, following `openai-base`'s `processStreamChunks`
 * lifecycle shape so the activity layer / agent loop behave identically across
 * providers. (Reasoning surfaces only the message-level events —
 * `REASONING_MESSAGE_START/CONTENT/END` — which is all the core accumulator
 * consumes; the `REASONING_START`/`REASONING_END`/`STEP_*` boundary events
 * openai-base also emits are no-ops in the engine and are not reproduced here.)
 *
 * Lifecycle ownership matches openai-base: this processor emits the full
 * success-path lifecycle itself — `RUN_STARTED` lazily before the first event,
 * `TEXT_MESSAGE_*` / `TOOL_CALL_*` / `REASONING_MESSAGE_*` for content, and a
 * single terminal `RUN_FINISHED` once the iterator is exhausted (so the trailing
 * `metadata` usage event is folded into the finish event regardless of arrival
 * order). The calling adapter only owns the catch/`RUN_ERROR` path — so any
 * in-band Converse error event (see `throwIfConverseStreamError`) is thrown to
 * surface there rather than ending the stream as a clean truncated success.
 *
 * Converse streams tool-call arguments as partial-JSON string fragments inside
 * `contentBlockDelta.delta.toolUse.input`; each fragment is emitted as a
 * `TOOL_CALL_ARGS` `delta`, mirroring OpenAI's `function.arguments` deltas.
 *
 * @param stream - The Converse event stream from `ConverseStreamCommand`.
 * @param newMessageId - Factory for fresh ids — run, thread, message, and
 *   tool-call ids (the adapter passes `() => this.generateId()`).
 * @param lifecycle - Incoming run lifecycle ids, threaded onto the emitted
 *   `RUN_STARTED`/`RUN_FINISHED` so the chat path matches every sibling adapter
 *   (openai-base reuses `options.threadId`/`parentRunId`). Defaults preserve the
 *   previous behaviour (fresh `threadId`, no `parentRunId`).
 */
export async function* processConverseStream(
  stream: AsyncIterable<ConverseStreamOutput>,
  newMessageId: () => string,
  lifecycle: { threadId?: string; parentRunId?: string; model?: string } = {},
): AsyncIterable<StreamChunk> {
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

  // Tool-call lifecycle, keyed by Converse contentBlockIndex. Converse opens a
  // tool-use block with `contentBlockStart`, streams arg fragments via
  // `contentBlockDelta`, and closes it with `contentBlockStop`.
  const toolCallsByIndex = new Map<
    number,
    { id: string; name: string; started: boolean }
  >()

  // Usage + finish-reason are captured during iteration and folded into the
  // single terminal RUN_FINISHED, matching openai-base's deferred-finish
  // contract (usage may arrive after the finish signal).
  let usage:
    | { promptTokens: number; completionTokens: number; totalTokens: number }
    | undefined
  let finishReason: NonNullable<RunFinishedEvent['finishReason']> | undefined

  // Lazily emit RUN_STARTED exactly once, before the first content event.
  function* ensureRunStarted(): Generator<StreamChunk> {
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
  function* closeReasoning(): Generator<StreamChunk> {
    if (reasoningMessageId && !hasClosedReasoning) {
      hasClosedReasoning = true
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningMessageId,
        timestamp: Date.now(),
      }
    }
  }

  for await (const ev of stream) {
    yield* ensureRunStarted()

    // Surface in-band server/throttle/validation errors instead of dropping them.
    throwIfConverseStreamError(ev)

    // messageStart carries only the role; no AG-UI event maps to it.
    if ('messageStart' in ev) continue

    if ('contentBlockStart' in ev) {
      const start = ev.contentBlockStart
      const toolUse = start?.start?.toolUse
      if (start && toolUse) {
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
      continue
    }

    if ('contentBlockDelta' in ev) {
      const block = ev.contentBlockDelta
      const delta = block?.delta
      const index = block?.contentBlockIndex ?? 0

      // Tool-call argument fragments (partial JSON).
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
        continue
      }

      // Reasoning content.
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
        continue
      }

      // Text content.
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
      continue
    }

    if ('contentBlockStop' in ev) {
      const stopIndex = ev.contentBlockStop?.contentBlockIndex ?? 0
      const toolCall = toolCallsByIndex.get(stopIndex)
      if (toolCall?.started) {
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId: toolCall.id,
          toolCallName: toolCall.name,
          toolName: toolCall.name,
          timestamp: Date.now(),
        }
        toolCallsByIndex.delete(stopIndex)
      }
      continue
    }

    if ('messageStop' in ev) {
      const stopReason = ev.messageStop?.stopReason
      // Map Converse stopReason to AG-UI's narrower finishReason vocabulary.
      finishReason =
        stopReason === 'tool_use'
          ? 'tool_calls'
          : stopReason === 'max_tokens'
            ? 'length'
            : stopReason === 'content_filtered'
              ? 'content_filter'
              : 'stop'
      continue
    }

    if ('metadata' in ev) {
      const u = ev.metadata?.usage
      if (u) {
        usage = {
          promptTokens: u.inputTokens ?? 0,
          completionTokens: u.outputTokens ?? 0,
          totalTokens: u.totalTokens ?? 0,
        }
      }
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
