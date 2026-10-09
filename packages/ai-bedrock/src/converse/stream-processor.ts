import { EventType } from '@tanstack/ai'
import { buildConverseUsage } from './usage'
import type { AdapterYieldChunk, TokenUsage } from '@tanstack/ai'
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

/** Map Converse blocks to run, text, reasoning, and tool events.
 * Keep signatures and encrypted bytes separate for each contentBlockIndex.
 * Finish after trailing usage events. The adapter handles thrown errors.
 */
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
  const reasoningByIndex = new Map<
    number,
    {
      id: string
      text: string
      signature: string
      bytes: Array<Uint8Array>
      redacted: boolean
      closed: boolean
      encrypted?: string
    }
  >()

  // Tool-call lifecycle, keyed by Converse contentBlockIndex. Converse opens a
  // tool-use block with `contentBlockStart`, streams arg fragments via
  // `contentBlockDelta`, and closes it with `contentBlockStop`.
  const toolCallsByIndex = new Map<
    number,
    {
      id: string
      name: string
      started: boolean
    }
  >()

  // Usage + finish-reason are captured during iteration and folded into the
  // single terminal RUN_FINISHED, matching openai-base's deferred-finish
  // contract (usage may arrive after the finish signal).
  let usage: TokenUsage | undefined
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
  function* encryptedReasoning(index: number): Generator<AdapterYieldChunk> {
    const reasoning = reasoningByIndex.get(index)
    if (!reasoning) return
    const encrypted = reasoning.redacted
      ? Buffer.concat(reasoning.bytes).toString('base64')
      : reasoning.signature
    if (!encrypted || encrypted === reasoning.encrypted) return
    reasoning.encrypted = encrypted
    yield {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      entityId: reasoning.id,
      subtype: 'message',
      encryptedValue: encrypted,
      ...(reasoning.redacted && {
        stepId: reasoning.id.startsWith('redacted_thinking-')
          ? reasoning.id
          : 'redacted_thinking-' + reasoning.id,
      }),
      timestamp: Date.now(),
    }
  }

  function* closeReasoning(index?: number): Generator<AdapterYieldChunk> {
    for (const [blockIndex, reasoning] of reasoningByIndex) {
      if (index !== undefined && index !== blockIndex) continue
      yield* encryptedReasoning(blockIndex)
      if (reasoning.closed) continue
      reasoning.closed = true
      yield {
        type: EventType.STEP_FINISHED,
        stepId: reasoning.id,
        stepName: reasoning.id,
        delta: '',
        content: reasoning.text,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoning.id,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.REASONING_END,
        messageId: reasoning.id,
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

      if (delta && 'reasoningContent' in delta && delta.reasoningContent) {
        const fragment = delta.reasoningContent
        let reasoning = reasoningByIndex.get(index)
        if (!reasoning) {
          const redacted =
            'redactedContent' in fragment &&
            (fragment.redactedContent?.length ?? 0) > 0
          reasoning = {
            id: (redacted ? 'redacted_thinking-' : '') + newMessageId(),
            text: '',
            signature: '',
            bytes: [],
            redacted,
            closed: false,
          }
          reasoningByIndex.set(index, reasoning)
          yield {
            type: EventType.STEP_STARTED,
            stepId: reasoning.id,
            stepName: reasoning.id,
            stepType: 'thinking',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.REASONING_MESSAGE_START,
            messageId: reasoning.id,
            role: 'reasoning',
            timestamp: Date.now(),
          }
        }
        if (
          !reasoning.redacted &&
          'text' in fragment &&
          fragment.text !== undefined
        ) {
          reasoning.text += fragment.text
          yield {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: reasoning.id,
            delta: fragment.text,
            timestamp: Date.now(),
          }
        }
        if (
          !reasoning.redacted &&
          'signature' in fragment &&
          fragment.signature !== undefined
        )
          reasoning.signature += fragment.signature
        if (
          'redactedContent' in fragment &&
          fragment.redactedContent &&
          fragment.redactedContent.length > 0
        ) {
          if (!reasoning.redacted) reasoning.encrypted = undefined
          reasoning.redacted = true
          reasoning.text = ''
          reasoning.signature = ''
          reasoning.bytes.push(fragment.redactedContent)
          yield* encryptedReasoning(index)
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
      yield* closeReasoning(stopIndex)
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
        usage = buildConverseUsage(u)
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
