import { EventType, buildBaseUsage } from '@tanstack/ai'
import type { AdapterYieldChunk, TokenUsage } from '@tanstack/ai'
import type {
  AcpSessionUpdate,
  AcpStopReason,
  AcpToolCallUpdate,
  AcpUsage,
} from '../types/acp-types'

export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

export type AcpStreamEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'update'; update: AcpSessionUpdate }
  | { kind: 'done'; stopReason: AcpStopReason; usage?: AcpUsage }

export interface AcpTranslateLabels {
  sessionIdEvent: string
  planEvent?: string
  refusalMessage?: string
  /**
   * When set, non-text agent message content (image / audio / resource /
   * resource_link blocks) is surfaced as a CUSTOM event under this name instead
   * of being dropped. Each event's `value` is `{ content: <ACP content block> }`.
   * Omit to keep the text-only behavior.
   */
  contentEvent?: string
}

export interface TranslateContext {
  model: string
  runId: string
  threadId: string
  parentRunId?: string
  genId: () => string
  labels: AcpTranslateLabels
  bridgedToolNames?: ReadonlySet<string>
  onAcpEvent?: (event: AcpStreamEvent) => void
}

export function matchBridgedToolName(
  title: string | null | undefined,
  bridgedToolNames: ReadonlySet<string> | undefined,
): string | undefined {
  if (!title || !bridgedToolNames) return undefined
  if (bridgedToolNames.has(title)) return title
  for (const name of bridgedToolNames) {
    if (title.startsWith(`${name} (`)) return name
  }
  return undefined
}

function resolveToolName(
  update: AcpToolCallUpdate,
  bridgedToolNames: ReadonlySet<string> | undefined,
): string {
  return (
    matchBridgedToolName(update.title, bridgedToolNames) ??
    update.kind ??
    'tool'
  )
}

function stringifyToolOutput(update: AcpToolCallUpdate): string {
  if (update.rawOutput !== undefined) {
    return typeof update.rawOutput === 'string'
      ? update.rawOutput
      : JSON.stringify(update.rawOutput)
  }
  const blocks = update.content ?? []
  const text = blocks
    .map((block) =>
      block.content && typeof block.content.text === 'string'
        ? block.content.text
        : '',
    )
    .join('')
  // Preserve non-text tool content (diff / terminal / image / resource blocks)
  // by serializing the structured array, rather than collapsing to a stub.
  const hasNonText = blocks.some(
    (block) =>
      block.type !== 'content' ||
      (block.content !== undefined && block.content.type !== 'text'),
  )
  if (hasNonText) return JSON.stringify(blocks)
  if (text !== '') return text
  return JSON.stringify({ status: update.status ?? 'completed' })
}

function buildUsage(usage: AcpUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  const promptTokens = usage.inputTokens ?? 0
  const completionTokens = usage.outputTokens ?? 0
  const result = buildBaseUsage({
    promptTokens,
    completionTokens,
    totalTokens: usage.totalTokens ?? promptTokens + completionTokens,
  })
  if (usage.cachedReadTokens || usage.cachedWriteTokens) {
    result.promptTokensDetails = {
      ...(usage.cachedReadTokens
        ? { cachedTokens: usage.cachedReadTokens }
        : {}),
      ...(usage.cachedWriteTokens
        ? { cacheWriteTokens: usage.cachedWriteTokens }
        : {}),
    }
  }
  if (usage.thoughtTokens) {
    result.completionTokensDetails = { reasoningTokens: usage.thoughtTokens }
  }
  return result
}

export async function* translateAcpStream(
  events: AsyncIterable<AcpStreamEvent>,
  ctx: TranslateContext,
): AsyncIterable<AdapterYieldChunk> {
  const { model, runId, threadId, genId, labels } = ctx
  let sessionCost: { amount: number; currency: string } | undefined
  const now = () => Date.now()

  let runStarted = false
  const unresolvedToolCalls = new Set<string>()
  const knownToolCalls = new Set<string>()
  // Calls started without `rawInput`: their ARGS + END wait for the
  // tool_call_update that carries it, or for the call to resolve, so no
  // TOOL_CALL_ARGS follows TOOL_CALL_END.
  const awaitingInput = new Map<
    string,
    { toolCallName: string; title?: string }
  >()

  let textMessageId: string | null = null
  let textContent = ''
  let reasoningId: string | null = null

  function* startRun(): Generator<AdapterYieldChunk> {
    if (runStarted) return
    runStarted = true
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model,
      timestamp: now(),
      ...(ctx.parentRunId !== undefined && { parentRunId: ctx.parentRunId }),
    }
  }

  function* closeText(): Generator<AdapterYieldChunk> {
    if (textMessageId !== null) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: textMessageId,
        model,
        timestamp: now(),
      }
    }
    textMessageId = null
    textContent = ''
  }

  function* closeReasoning(): Generator<AdapterYieldChunk> {
    if (reasoningId !== null) {
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningId,
        model,
        timestamp: now(),
      }
      yield {
        type: EventType.REASONING_END,
        messageId: reasoningId,
        model,
        timestamp: now(),
      }
    }
    reasoningId = null
  }

  function* synthesizeUnresolvedResults(): Generator<AdapterYieldChunk> {
    for (const toolCallId of unresolvedToolCalls) {
      yield* closeAwaitingToolCall({ toolCallId })
      yield {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: genId(),
        model,
        timestamp: now(),
        content: JSON.stringify({ status: 'interrupted' }),
      }
    }
    unresolvedToolCalls.clear()
  }

  // ACP treats an omitted and a null rawInput alike: no input yet.
  function hasRawInput(update: Pick<AcpToolCallUpdate, 'rawInput'>): boolean {
    return update.rawInput != null
  }

  function toolCallInput(
    update: Pick<AcpToolCallUpdate, 'title' | 'rawInput'>,
  ): Record<string, unknown> {
    return {
      ...(update.title != null && { title: update.title }),
      ...(hasRawInput(update)
        ? typeof update.rawInput === 'object'
          ? (update.rawInput as Record<string, unknown>)
          : { input: update.rawInput }
        : {}),
    }
  }

  function* emitArgsAndEnd(
    toolCallId: string,
    toolCallName: string,
    input: Record<string, unknown>,
  ): Generator<AdapterYieldChunk> {
    const args = JSON.stringify(input)
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      model,
      timestamp: now(),
      delta: args,
      args,
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      toolCallName,
      model,
      timestamp: now(),
      input,
    }
  }

  function* openToolCall(
    update: AcpToolCallUpdate,
  ): Generator<AdapterYieldChunk> {
    if (knownToolCalls.has(update.toolCallId)) return
    knownToolCalls.add(update.toolCallId)
    const toolCallName = resolveToolName(update, ctx.bridgedToolNames)
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: update.toolCallId,
      toolCallName,
      model,
      timestamp: now(),
    }
    unresolvedToolCalls.add(update.toolCallId)
    const resolved = update.status === 'completed' || update.status === 'failed'
    if (!hasRawInput(update) && !resolved) {
      awaitingInput.set(update.toolCallId, {
        toolCallName,
        ...(update.title != null && { title: update.title }),
      })
      return
    }
    yield* emitArgsAndEnd(
      update.toolCallId,
      toolCallName,
      toolCallInput(update),
    )
  }

  // Sends the ARGS + END of a call opened without input, using the latest
  // title and any rawInput this update carries. No-op once the call is closed.
  function* closeAwaitingToolCall(
    update: Pick<AcpToolCallUpdate, 'toolCallId' | 'title' | 'rawInput'>,
  ): Generator<AdapterYieldChunk> {
    const open = awaitingInput.get(update.toolCallId)
    if (!open) return
    awaitingInput.delete(update.toolCallId)
    const input = toolCallInput({
      title: update.title ?? open.title,
      rawInput: update.rawInput,
    })
    yield* emitArgsAndEnd(update.toolCallId, open.toolCallName, input)
  }

  function* resolveToolCall(
    update: AcpToolCallUpdate,
  ): Generator<AdapterYieldChunk> {
    yield* openToolCall(update)
    yield* closeAwaitingToolCall(update)
    unresolvedToolCalls.delete(update.toolCallId)
    yield {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: update.toolCallId,
      messageId: genId(),
      model,
      timestamp: now(),
      content: stringifyToolOutput(update),
      ...(update.status === 'failed' && { state: 'output-error' as const }),
    }
  }

  function* handleUpdate(
    update: AcpSessionUpdate,
  ): Generator<AdapterYieldChunk> {
    if (update.sessionUpdate === 'usage_update') {
      if (update.cost) sessionCost = update.cost
    } else if (update.sessionUpdate === 'agent_message_chunk') {
      yield* closeReasoning()
      // Non-text content (image / audio / resource / resource_link): surface it
      // as a CUSTOM event when the harness opted in, instead of dropping it.
      if (update.content.type !== 'text') {
        if (labels.contentEvent !== undefined) {
          yield* closeText()
          yield {
            type: EventType.CUSTOM,
            model,
            timestamp: now(),
            name: labels.contentEvent,
            value: { content: update.content },
          }
        }
        return
      }
      const text =
        typeof update.content.text === 'string' ? update.content.text : ''
      if (text === '') return
      if (textMessageId === null) {
        textMessageId = genId()
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: textMessageId,
          model,
          timestamp: now(),
          role: 'assistant',
        }
      }
      textContent += text
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: textMessageId,
        model,
        timestamp: now(),
        delta: text,
        content: textContent,
      }
    } else if (update.sessionUpdate === 'agent_thought_chunk') {
      yield* closeText()
      const thought =
        typeof update.content.text === 'string' ? update.content.text : ''
      if (thought === '') return
      if (reasoningId === null) {
        reasoningId = genId()
        yield {
          type: EventType.REASONING_START,
          messageId: reasoningId,
          model,
          timestamp: now(),
        }
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: reasoningId,
          role: 'reasoning' as const,
          model,
          timestamp: now(),
        }
      }
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningId,
        delta: thought,
        model,
        timestamp: now(),
      }
    } else if (update.sessionUpdate === 'tool_call') {
      yield* closeText()
      yield* closeReasoning()
      yield* openToolCall(update)
      if (update.status === 'completed' || update.status === 'failed') {
        yield* resolveToolCall(update)
      }
    } else if (update.sessionUpdate === 'tool_call_update') {
      if (update.status === 'completed' || update.status === 'failed') {
        yield* resolveToolCall(update)
      } else if (update.status === 'in_progress' && hasRawInput(update)) {
        yield* closeText()
        yield* closeReasoning()
        if (!knownToolCalls.has(update.toolCallId)) {
          yield* openToolCall(update)
        } else {
          // A call already closed keeps its arguments: AG-UI has no
          // TOOL_CALL_ARGS after TOOL_CALL_END.
          yield* closeAwaitingToolCall(update)
        }
      }
    } else if (
      update.sessionUpdate === 'plan' &&
      labels.planEvent !== undefined
    ) {
      yield {
        type: EventType.CUSTOM,
        model,
        timestamp: now(),
        name: labels.planEvent,
        value: { entries: update.entries },
      }
    }
  }

  try {
    for await (const event of events) {
      ctx.onAcpEvent?.(event)

      if (event.kind === 'session') {
        yield* startRun()
        yield {
          type: EventType.CUSTOM,
          model,
          timestamp: now(),
          name: labels.sessionIdEvent,
          value: { sessionId: event.sessionId },
        }
      } else if (event.kind === 'update') {
        yield* startRun()
        yield* handleUpdate(event.update)
      } else {
        yield* startRun()
        yield* closeText()
        yield* closeReasoning()
        yield* synthesizeUnresolvedResults()

        const usage = buildUsage(event.usage)
        // ponytail: the ACP cost is the whole session's total, so it is kept
        // as a detail. As `usage.cost` it would count earlier turns again.
        if (usage && sessionCost) {
          usage.providerUsageDetails = {
            ...usage.providerUsageDetails,
            sessionCost: {
              amount: sessionCost.amount,
              currency: sessionCost.currency,
            },
          }
        }
        if (event.stopReason === 'refusal') {
          const message =
            labels.refusalMessage ?? 'The harness refused the request.'
          yield {
            type: EventType.RUN_ERROR,
            model,
            timestamp: now(),
            message,
            code: 'refusal',
            error: { message, code: 'refusal' },
            ...(usage && { usage }),
          }
        } else {
          const finishReason =
            event.stopReason === 'max_tokens' ||
            event.stopReason === 'max_turn_requests'
              ? ('length' as const)
              : ('stop' as const)
          yield {
            type: EventType.RUN_FINISHED,
            runId,
            threadId,
            model,
            timestamp: now(),
            finishReason,
            ...(usage !== undefined && { usage }),
          }
        }
      }
    }
  } catch (error) {
    yield* closeText()
    yield* closeReasoning()
    yield* synthesizeUnresolvedResults()
    throw error
  }
}
