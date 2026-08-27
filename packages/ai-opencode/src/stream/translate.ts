import { EventType, buildBaseUsage } from '@tanstack/ai'
import type { AdapterYieldChunk, TokenUsage } from '@tanstack/ai'
import type {
  OpencodeAssistantMessage,
  OpencodeEvent,
  OpencodePart,
  OpencodeStreamEvent,
  OpencodeTokens,
} from './sdk-types'

/** Name of the CUSTOM event carrying the OpenCode session id. */
export const SESSION_ID_EVENT = 'opencode.session-id'

/** Name of the CUSTOM event carrying the harness's todo list updates. */
export const TODO_EVENT = 'opencode.todo'

/** Server name used for bridged TanStack tools. */
export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

export interface TranslateContext {
  model: string
  runId: string
  threadId: string
  parentRunId?: string
  genId: () => string
  bridgedToolNames?: ReadonlySet<string>
  /** Called for each raw stream event, for logging. */
  onStreamEvent?: (event: OpencodeStreamEvent) => void
}

export function resolveToolName(
  tool: string,
  bridgedToolNames: ReadonlySet<string> | undefined,
): string {
  if (!bridgedToolNames) return tool
  if (bridgedToolNames.size === 0) return tool
  if (bridgedToolNames.has(tool)) return tool
  const isPrefixedBridge =
    tool.startsWith('tanstack_') && bridgedToolNames.has(tool.slice(9))
  if (isPrefixedBridge) {
    return tool.slice(9)
  }
  return tool
}

function buildUsage(
  tokens: OpencodeTokens | undefined,
): TokenUsage | undefined {
  if (!tokens) return undefined
  const promptTokens = tokens.input ?? 0
  const completionTokens = tokens.output ?? 0
  const result = buildBaseUsage({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  })
  if (tokens.cache?.read) {
    result.promptTokensDetails = { cachedTokens: tokens.cache.read }
  }
  if (tokens.reasoning) {
    result.completionTokensDetails = { reasoningTokens: tokens.reasoning }
  }
  return result
}

type TextPart = Extract<OpencodePart, { type: 'text' }>
type ReasoningPart = Extract<OpencodePart, { type: 'reasoning' }>
type ToolPart = Extract<OpencodePart, { type: 'tool' }>

const isTextPart = (part: OpencodePart): part is TextPart =>
  part.type === 'text'
const isReasoningPart = (part: OpencodePart): part is ReasoningPart =>
  part.type === 'reasoning'
const isToolPart = (part: OpencodePart): part is ToolPart =>
  part.type === 'tool'

function messageError(
  message: OpencodeAssistantMessage,
): { message: string } | undefined {
  if (!message.error) return undefined
  return { message: message.error.data?.message ?? message.error.name }
}

export async function* translateOpencodeStream(
  events: AsyncIterable<OpencodeStreamEvent>,
  ctx: TranslateContext,
): AsyncIterable<AdapterYieldChunk> {
  const { model, runId, threadId, genId } = ctx
  const now = () => Date.now()

  let runStarted = false
  /** Tool calls started but with no result yet, keyed by callID. */
  const unresolvedToolCalls = new Set<string>()
  /** Tool call ids that already emitted TOOL_CALL_START/ARGS/END. */
  const openedToolCalls = new Set<string>()
  /** Tool call ids that already emitted a TOOL_CALL_RESULT. */
  const resolvedToolCalls = new Set<string>()

  /** Accumulated text per text-part id, for delta derivation. */
  const textAccumulators = new Map<string, string>()
  let openTextId: string | null = null
  let openReasoningId: string | null = null

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
    if (openTextId !== null) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: openTextId,
        model,
        timestamp: now(),
      }
      openTextId = null
    }
  }

  function* closeReasoning(): Generator<AdapterYieldChunk> {
    if (openReasoningId !== null) {
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: openReasoningId,
        model,
        timestamp: now(),
      }
      yield {
        type: EventType.REASONING_END,
        messageId: openReasoningId,
        model,
        timestamp: now(),
      }
      openReasoningId = null
    }
  }

  function* synthesizeUnresolvedResults(): Generator<AdapterYieldChunk> {
    for (const toolCallId of unresolvedToolCalls) {
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

  function* handleTextPart(
    part: Extract<OpencodePart, { type: 'text' }>,
    delta: string | undefined,
  ): Generator<AdapterYieldChunk> {
    yield* closeReasoning()

    const prev = textAccumulators.get(part.id) ?? ''
    let deltaText: string
    if (typeof delta === 'string' && delta !== '') {
      deltaText = delta
      textAccumulators.set(part.id, prev + delta)
    } else {
      const full = part.text
      deltaText = full.startsWith(prev) ? full.slice(prev.length) : full
      textAccumulators.set(part.id, full)
    }
    if (deltaText === '') return

    if (openTextId !== part.id) {
      yield* closeText()
      openTextId = part.id
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId: part.id,
        model,
        timestamp: now(),
        role: 'assistant',
      }
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: part.id,
      model,
      timestamp: now(),
      delta: deltaText,
      content: textAccumulators.get(part.id) ?? deltaText,
    }
  }

  function* handleReasoningPart(
    part: Extract<OpencodePart, { type: 'reasoning' }>,
    delta: string | undefined,
  ): Generator<AdapterYieldChunk> {
    yield* closeText()

    const prev = textAccumulators.get(part.id) ?? ''
    let deltaText: string
    if (typeof delta === 'string' && delta !== '') {
      deltaText = delta
      textAccumulators.set(part.id, prev + delta)
    } else {
      const full = part.text
      deltaText = full.startsWith(prev) ? full.slice(prev.length) : full
      textAccumulators.set(part.id, full)
    }
    if (deltaText === '') return

    if (openReasoningId !== part.id) {
      yield* closeReasoning()
      openReasoningId = part.id
      yield {
        type: EventType.REASONING_START,
        messageId: part.id,
        model,
        timestamp: now(),
      }
      yield {
        type: EventType.REASONING_MESSAGE_START,
        messageId: part.id,
        role: 'reasoning' as const,
        model,
        timestamp: now(),
      }
    }
    yield {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: part.id,
      delta: deltaText,
      model,
      timestamp: now(),
    }
  }

  function* openToolCall(
    part: Extract<OpencodePart, { type: 'tool' }>,
  ): Generator<AdapterYieldChunk> {
    if (openedToolCalls.has(part.callID)) return
    openedToolCalls.add(part.callID)
    const toolCallName = resolveToolName(part.tool, ctx.bridgedToolNames)
    const input = part.state.input ?? {}
    const args = JSON.stringify(input)
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: part.callID,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
    }
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: part.callID,
      model,
      timestamp: now(),
      delta: args,
      args,
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: part.callID,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
      input,
    }
    unresolvedToolCalls.add(part.callID)
  }

  function* handleToolPart(
    part: Extract<OpencodePart, { type: 'tool' }>,
  ): Generator<AdapterYieldChunk> {
    yield* closeText()
    yield* closeReasoning()
    yield* openToolCall(part)

    const state = part.state
    const stillRunning =
      state.status !== 'completed' && state.status !== 'error'
    if (stillRunning) return
    if (resolvedToolCalls.has(part.callID)) return
    resolvedToolCalls.add(part.callID)
    unresolvedToolCalls.delete(part.callID)

    const isError = state.status === 'error'
    yield {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: part.callID,
      messageId: genId(),
      model,
      timestamp: now(),
      content: isError ? state.error : state.output,
      ...(isError && { state: 'output-error' as const }),
    }
  }

  function* handleEvent(event: OpencodeEvent): Generator<AdapterYieldChunk> {
    if (event.type === 'message.part.updated') {
      const { part, delta } = event.properties
      if (isTextPart(part)) {
        yield* handleTextPart(part, delta)
      } else if (isReasoningPart(part)) {
        yield* handleReasoningPart(part, delta)
      } else if (isToolPart(part)) {
        yield* handleToolPart(part)
      }
      // Other part kinds (file, step-start/finish, snapshot, ...) carry no
      // state the chunk stream needs.
    } else if (event.type === 'todo.updated') {
      yield {
        type: EventType.CUSTOM,
        model,
        timestamp: now(),
        name: TODO_EVENT,
        value: { todos: event.properties.todos },
      }
    }
    // session.idle / session.status / message.updated are redundant with the
    // terminal `done` event and are ignored.
  }

  function* finish(
    message: OpencodeAssistantMessage,
  ): Generator<AdapterYieldChunk> {
    yield* startRun()
    yield* closeText()
    yield* closeReasoning()
    yield* synthesizeUnresolvedResults()

    const error = messageError(message)
    if (error) {
      yield {
        type: EventType.RUN_ERROR,
        model,
        timestamp: now(),
        message: error.message,
        error,
      }
      return
    }

    const usage = buildUsage(message.tokens)
    const finishReason = message.finish === 'length' ? 'length' : 'stop'
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

  try {
    for await (const streamEvent of events) {
      ctx.onStreamEvent?.(streamEvent)

      if (streamEvent.kind === 'session') {
        yield* startRun()
        yield {
          type: EventType.CUSTOM,
          model,
          timestamp: now(),
          name: SESSION_ID_EVENT,
          value: { sessionId: streamEvent.sessionId },
        }
      } else if (streamEvent.kind === 'event') {
        yield* startRun()
        yield* handleEvent(streamEvent.event)
      } else {
        yield* finish(streamEvent.message)
      }
    }
  } catch (error) {
    yield* closeText()
    yield* closeReasoning()
    yield* synthesizeUnresolvedResults()
    throw error
  }
}
