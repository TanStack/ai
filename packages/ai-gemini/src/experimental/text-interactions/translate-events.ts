import { EventType } from '@tanstack/ai'
import { parse as parsePartialJSON } from 'partial-json'
import { generateId } from '../../utils/client'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk } from '@tanstack/ai'
import type { Interactions } from '@google/genai'

type Interaction = Interactions.Interaction
type InteractionSSEEvent = Interactions.InteractionSSEEvent

type ToolCallState = {
  name: string
  args: Record<string, unknown>
  index: number
  started: boolean
  ended: boolean
}

type TranslateState = {
  model: string
  runId: string
  threadId: string
  parentRunId: string | undefined
  timestamp: number
  adapterName: string
  logger: InternalLogger
  messageId: string
  hasEmittedRunStarted: boolean
  hasEmittedTextMessageStart: boolean
  textAccumulated: string
  interactionId: string | undefined
  sawFunctionCall: boolean
  toolCalls: Map<string, ToolCallState>
  nextToolIndex: number
  thinkingStepId: string | null
  thinkingAccumulated: string
  reasoningMessageId: string | null
  hasClosedReasoning: boolean
  indexToToolCallId: Map<number, string>
  argStringByToolCallId: Map<string, string>
  done: boolean
}

type EventHandler = (
  event: InteractionSSEEvent,
  state: TranslateState,
) => Generator<AdapterYieldChunk>

function statusToFinishReason(
  status: Interaction['status'] | undefined,
  sawFunctionCall: boolean,
): 'stop' | 'length' | 'tool_calls' | null {
  if (status === 'requires_action') return 'tool_calls'
  if (status === 'incomplete') return 'length'
  if (sawFunctionCall) return 'tool_calls'
  return 'stop'
}

function statusIsError(
  status: Interaction['status'] | undefined,
): status is 'failed' | 'cancelled' {
  return status === 'failed' || status === 'cancelled'
}

function parsePartialToolArguments(
  raw: string,
): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed = parsePartialJSON(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function createTranslateState(
  model: string,
  runId: string,
  threadId: string,
  parentRunId: string | undefined,
  timestamp: number,
  adapterName: string,
  logger: InternalLogger,
): TranslateState {
  return {
    model,
    runId,
    threadId,
    parentRunId,
    timestamp,
    adapterName,
    logger,
    messageId: generateId(adapterName),
    hasEmittedRunStarted: false,
    hasEmittedTextMessageStart: false,
    textAccumulated: '',
    interactionId: undefined,
    sawFunctionCall: false,
    toolCalls: new Map(),
    nextToolIndex: 0,
    thinkingStepId: null,
    thinkingAccumulated: '',
    reasoningMessageId: null,
    hasClosedReasoning: false,
    indexToToolCallId: new Map(),
    argStringByToolCallId: new Map(),
    done: false,
  }
}

function* emitRunStartedIfNeeded(
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (!state.hasEmittedRunStarted) {
    state.hasEmittedRunStarted = true
    yield {
      type: EventType.RUN_STARTED,
      runId: state.runId,
      threadId: state.threadId,
      model: state.model,
      timestamp: state.timestamp,
      parentRunId: state.parentRunId,
    }
  }
}

function* closeReasoningIfNeeded(
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (state.reasoningMessageId && !state.hasClosedReasoning) {
    state.hasClosedReasoning = true
    yield {
      type: EventType.REASONING_MESSAGE_END,
      messageId: state.reasoningMessageId,
      model: state.model,
      timestamp: state.timestamp,
    }
    yield {
      type: EventType.REASONING_END,
      messageId: state.reasoningMessageId,
      model: state.model,
      timestamp: state.timestamp,
    }
    state.thinkingStepId = null
    state.reasoningMessageId = null
    state.hasClosedReasoning = false
  }
}

function* closeOpenState(state: TranslateState): Generator<AdapterYieldChunk> {
  yield* closeReasoningIfNeeded(state)
  for (const [toolCallId, toolState] of state.toolCalls) {
    if (toolState.ended) continue
    toolState.ended = true
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      toolName: toolState.name,
      model: state.model,
      timestamp: state.timestamp,
      input: toolState.args,
    }
  }
  if (state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = false
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: state.messageId,
      model: state.model,
      timestamp: state.timestamp,
    }
  }
}

function* openReasoningIfNeeded(
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (state.thinkingStepId !== null && state.reasoningMessageId !== null) {
    return
  }
  state.thinkingStepId = generateId(state.adapterName)
  state.reasoningMessageId = generateId(state.adapterName)
  yield {
    type: EventType.REASONING_START,
    messageId: state.reasoningMessageId,
    model: state.model,
    timestamp: state.timestamp,
  }
  yield {
    type: EventType.REASONING_MESSAGE_START,
    messageId: state.reasoningMessageId,
    role: 'reasoning',
    model: state.model,
    timestamp: state.timestamp,
  }
  yield {
    type: EventType.STEP_STARTED,
    stepName: state.thinkingStepId,
    stepId: state.thinkingStepId,
    model: state.model,
    timestamp: state.timestamp,
    stepType: 'thinking',
  }
}

function* emitReasoningContent(
  state: TranslateState,
  text: string,
): Generator<AdapterYieldChunk> {
  if (state.reasoningMessageId === null || state.thinkingStepId === null) {
    return
  }
  state.thinkingAccumulated += text
  yield {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: state.reasoningMessageId,
    delta: text,
    model: state.model,
    timestamp: state.timestamp,
  }
  yield {
    type: EventType.STEP_FINISHED,
    stepName: state.thinkingStepId,
    stepId: state.thinkingStepId,
    model: state.model,
    timestamp: state.timestamp,
    delta: text,
    content: state.thinkingAccumulated,
  }
}

function* emitTextDelta(
  state: TranslateState,
  text: string,
): Generator<AdapterYieldChunk> {
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: state.messageId,
      model: state.model,
      timestamp: state.timestamp,
      role: 'assistant',
    }
  }
  state.textAccumulated += text
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: state.messageId,
    model: state.model,
    timestamp: state.timestamp,
    delta: text,
    content: state.textAccumulated,
  }
}

function* emitCustomStep(
  state: TranslateState,
  name: string,
  value: unknown,
): Generator<AdapterYieldChunk> {
  yield* closeReasoningIfNeeded(state)
  yield {
    type: EventType.CUSTOM,
    name,
    value,
    model: state.model,
    timestamp: state.timestamp,
  }
}

function* handleInteractionCreated(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'interaction.created') return
  state.interactionId = event.interaction.id
  yield* emitRunStartedIfNeeded(state)
}

function* handleFunctionCallStart(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.start') return
  if (event.step.type !== 'function_call') return
  yield* closeReasoningIfNeeded(state)
  state.sawFunctionCall = true
  const toolCallId = event.step.id
  state.indexToToolCallId.set(event.index, toolCallId)
  const initialArgs = event.step.arguments
  const toolState: ToolCallState = {
    name: event.step.name,
    args: { ...initialArgs },
    index: state.nextToolIndex++,
    started: true,
    ended: false,
  }
  state.toolCalls.set(toolCallId, toolState)
  state.argStringByToolCallId.set(
    toolCallId,
    Object.keys(initialArgs).length > 0 ? JSON.stringify(initialArgs) : '',
  )
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: toolState.name,
    toolName: toolState.name,
    parentMessageId: state.messageId,
    model: state.model,
    timestamp: state.timestamp,
    index: toolState.index,
  }
  if (Object.keys(initialArgs).length > 0) {
    const argsJson = JSON.stringify(initialArgs)
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      model: state.model,
      timestamp: state.timestamp,
      delta: argsJson,
      args: argsJson,
    }
  }
}

function* handleThoughtStart(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.start') return
  if (event.step.type !== 'thought') return
  yield* openReasoningIfNeeded(state)
  for (const part of event.step.summary ?? []) {
    if (part.type !== 'text' || !part.text) continue
    yield* emitReasoningContent(state, part.text)
  }
}

function* handleModelOutputStart(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.start') return
  if (event.step.type !== 'model_output') return
  yield* closeReasoningIfNeeded(state)
  for (const part of event.step.content ?? []) {
    if (part.type !== 'text' || !part.text) continue
    yield* emitTextDelta(state, part.text)
  }
}

const STEP_START_CUSTOM_EVENT = new Map<string, string>([
  ['google_search_call', 'gemini.googleSearchCall'],
  ['google_search_result', 'gemini.googleSearchResult'],
  ['code_execution_call', 'gemini.codeExecutionCall'],
  ['code_execution_result', 'gemini.codeExecutionResult'],
  ['url_context_call', 'gemini.urlContextCall'],
  ['url_context_result', 'gemini.urlContextResult'],
  ['file_search_call', 'gemini.fileSearchCall'],
  ['file_search_result', 'gemini.fileSearchResult'],
])

const STEP_START_HANDLERS = new Map<string, EventHandler>([
  ['function_call', handleFunctionCallStart],
  ['thought', handleThoughtStart],
  ['model_output', handleModelOutputStart],
])

function* handleStepStart(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.start') return
  yield* emitRunStartedIfNeeded(state)
  const step = event.step
  const customName = STEP_START_CUSTOM_EVENT.get(step.type)
  if (customName) {
    yield* emitCustomStep(state, customName, step)
    return
  }
  const handler = STEP_START_HANDLERS.get(step.type)
  if (handler) {
    yield* handler(event, state)
    return
  }
  state.logger.provider(`gemini-text-interactions unhandled step.start`, {
    step,
  })
}

function* handleTextDelta(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.delta') return
  if (event.delta.type !== 'text') return
  yield* closeReasoningIfNeeded(state)
  yield* emitTextDelta(state, event.delta.text)
}

function* handleArgumentsDelta(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.delta') return
  if (event.delta.type !== 'arguments_delta') return
  const toolCallId = state.indexToToolCallId.get(event.index)
  if (!toolCallId) {
    state.logger.provider(
      `gemini-text-interactions arguments_delta for unknown step index`,
      { index: event.index, delta: event.delta },
    )
    return
  }
  const toolState = state.toolCalls.get(toolCallId)
  if (!toolState) return
  const fragment = event.delta.arguments ?? ''
  const buffer = (state.argStringByToolCallId.get(toolCallId) ?? '') + fragment
  state.argStringByToolCallId.set(toolCallId, buffer)
  const parsed = parsePartialToolArguments(buffer)
  if (parsed) toolState.args = parsed
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    model: state.model,
    timestamp: state.timestamp,
    delta: fragment,
    args: buffer,
  }
}

function* handleThoughtSummaryDelta(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.delta') return
  if (event.delta.type !== 'thought_summary') return
  const thoughtText =
    event.delta.content && 'text' in event.delta.content
      ? event.delta.content.text
      : ''
  if (!thoughtText) return
  yield* openReasoningIfNeeded(state)
  yield* emitReasoningContent(state, thoughtText)
}

const STEP_DELTA_HANDLERS = new Map<string, EventHandler>([
  ['text', handleTextDelta],
  ['arguments_delta', handleArgumentsDelta],
  ['thought_summary', handleThoughtSummaryDelta],
])

function* handleStepDelta(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.delta') return
  yield* emitRunStartedIfNeeded(state)
  const handler = STEP_DELTA_HANDLERS.get(event.delta.type)
  if (handler) {
    yield* handler(event, state)
    return
  }
  state.logger.provider(`gemini-text-interactions unhandled step.delta type`, {
    delta: event.delta,
  })
}

function* handleStepStop(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'step.stop') return
  const toolCallId = state.indexToToolCallId.get(event.index)
  if (!toolCallId) return
  const toolState = state.toolCalls.get(toolCallId)
  if (toolState && !toolState.ended) {
    toolState.ended = true
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      toolName: toolState.name,
      model: state.model,
      timestamp: state.timestamp,
      input: toolState.args,
    }
  }
  state.indexToToolCallId.delete(event.index)
}

function* handleStatusUpdate(): Generator<AdapterYieldChunk> {}

function* handleInteractionCompleted(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'interaction.completed') return
  if (event.interaction.id) {
    state.interactionId = event.interaction.id
  }

  yield* closeOpenState(state)

  const status = event.interaction.status
  if (statusIsError(status)) {
    const message = `Gemini Interactions ${status}: the interaction ended without a usable response.`
    state.logger.errors(
      'gemini-text-interactions.translateInteractionEvents non-success status',
      {
        source: 'gemini-text-interactions.chatStream',
        status,
        interactionId: state.interactionId,
      },
    )
    yield {
      type: EventType.RUN_ERROR,
      runId: state.runId,
      model: state.model,
      timestamp: state.timestamp,
      message,
      code: status,
      error: { message, code: status },
    }
    state.done = true
    return
  }

  const usage = event.interaction.usage
  const finishReason = statusToFinishReason(status, state.sawFunctionCall)

  if (state.interactionId) {
    yield {
      type: EventType.CUSTOM,
      name: 'gemini.interactionId',
      value: { interactionId: state.interactionId },
      model: state.model,
      timestamp: state.timestamp,
    }
  }

  yield {
    type: EventType.RUN_FINISHED,
    runId: state.runId,
    threadId: state.threadId,
    model: state.model,
    timestamp: state.timestamp,
    finishReason,
    usage: usage
      ? {
          promptTokens: usage.total_input_tokens ?? 0,
          completionTokens: usage.total_output_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }
      : undefined,
  }
  state.done = true
}

function* handleError(
  event: InteractionSSEEvent,
  state: TranslateState,
): Generator<AdapterYieldChunk> {
  if (event.event_type !== 'error') return
  yield* closeOpenState(state)
  const rawMessage = event.error?.message
  const message =
    typeof rawMessage === 'string' && rawMessage.length > 0
      ? rawMessage
      : `Gemini Interactions error (no message): ${JSON.stringify(event.error ?? {})}`
  const rawCode = event.error?.code
  const code =
    typeof rawCode === 'string' || typeof rawCode === 'number'
      ? String(rawCode)
      : undefined
  yield {
    type: EventType.RUN_ERROR,
    runId: state.runId,
    model: state.model,
    timestamp: state.timestamp,
    message,
    code,
    error: { message, code },
  }
  state.done = true
}

const EVENT_HANDLERS = new Map<string, EventHandler>([
  ['interaction.created', handleInteractionCreated],
  ['step.start', handleStepStart],
  ['step.delta', handleStepDelta],
  ['step.stop', handleStepStop],
  ['interaction.status_update', handleStatusUpdate],
  ['interaction.completed', handleInteractionCompleted],
  ['error', handleError],
])

export async function* translateInteractionEvents(
  stream: AsyncIterable<InteractionSSEEvent>,
  model: string,
  runId: string,
  threadId: string,
  parentRunId: string | undefined,
  timestamp: number,
  adapterName: string,
  logger: InternalLogger,
): AsyncIterable<AdapterYieldChunk> {
  const state = createTranslateState(
    model,
    runId,
    threadId,
    parentRunId,
    timestamp,
    adapterName,
    logger,
  )

  for await (const event of stream) {
    logger.provider(`provider=gemini-text-interactions`, { event })
    const handler = EVENT_HANDLERS.get(event.event_type)
    if (handler) {
      yield* handler(event, state)
    } else {
      logger.provider(`gemini-text-interactions unhandled event_type`, {
        event,
      })
    }
    if (state.done) return
  }

  yield* closeOpenState(state)
}
