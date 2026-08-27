import { EventType } from '@tanstack/ai'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { extractUsageCost } from './cost'
import type {
  ContentPartAddedEventPart,
  OpenResponsesResult,
  OutputItems,
  StreamEvents,
} from '@openrouter/sdk/models'
import type { AdapterYieldChunk } from '@tanstack/ai'
import type { OpenRouterResponsesToolCallMetadata } from '../message-types'

export interface StreamedFunctionCallMetadata {
  callId: string
  index: number
  itemId: string
  name: string
  started: boolean
  ended?: boolean
  pendingArguments?: string
}

interface ResponsesStreamLog {
  provider: (message: string, extra?: Record<string, unknown>) => void
  errors: (message: string, extra?: Record<string, unknown>) => void
}

interface ResponsesLoopOptions {
  model: string
  parentRunId?: string
  logger: ResponsesStreamLog
}

interface ResponsesAguiState {
  runId: string
  threadId: string
  messageId: string
  hasEmittedRunStarted: boolean
}

interface NormalizedStreamEvent {
  type: string
  itemId?: string
  outputIndex?: number
  contentIndex?: number
  delta?: string | Array<string>
  text?: string
  arguments?: string
  message?: string
  code?: unknown
  param?: string | null
  sequenceNumber?: number
  /** camelCased copy of the `response` payload from `response.{completed,failed,incomplete}` events. */
  response?: Partial<OpenResponsesResult>
  /** SDK discriminated union — narrow with `item.type === '<variant>'`. */
  item?: OutputItems
  part?: ContentPartAddedEventPart
}

interface FunctionCallItem {
  id: string
  callId?: string
  name?: string
  arguments?: string
}

interface ResponsesStreamState {
  adapterName: string
  options: ResponsesLoopOptions
  aguiState: ResponsesAguiState
  toolCallMetadata: Map<string, StreamedFunctionCallMetadata>
  accumulatedContent: string
  accumulatedReasoning: string
  hasStreamedContentDeltas: boolean
  hasStreamedReasoningDeltas: boolean
  model: string
  stepId: string | null
  hasEmittedTextMessageStart: boolean
  reasoningMessageId: string | undefined
  hasClosedReasoning: boolean
  runFinishedEmitted: boolean
  stop: boolean
}

type StreamHandler = (
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
) => Generator<AdapterYieldChunk, void, unknown> | void

export interface ResponsesStructuredState {
  adapterName: string
  accumulatedContent: string
  accumulatedReasoning: string
  hasEmittedTextMessageStart: boolean
  reasoningMessageId: string | undefined
  stepId: string | undefined
  hasClosedReasoning: boolean
  model: string
  usage:
    | {
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
      }
    | undefined
  stop: boolean
}

function emitModel(state: ResponsesStreamState): string {
  return state.model || state.options.model
}

function streamDeltaToString(
  delta: string | Array<string> | undefined,
): string {
  if (Array.isArray(delta)) return delta.join('')
  if (typeof delta === 'string') return delta
  return ''
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false
  }
  return error.name === 'AbortError' || error.name === 'RequestAbortedError'
}

function* emitRunStartedIfNeeded(
  aguiState: ResponsesAguiState,
  model: string,
  parentRunId: string | undefined,
): Generator<AdapterYieldChunk> {
  if (aguiState.hasEmittedRunStarted) return
  aguiState.hasEmittedRunStarted = true
  yield {
    type: EventType.RUN_STARTED,
    runId: aguiState.runId,
    threadId: aguiState.threadId,
    model,
    timestamp: Date.now(),
    parentRunId,
  }
}

function* openReasoning(
  state: ResponsesStreamState,
): Generator<AdapterYieldChunk> {
  if (state.reasoningMessageId) return
  state.reasoningMessageId = generateId(state.adapterName)
  state.stepId = generateId(state.adapterName)
  const timestamp = Date.now()
  const currentModel = emitModel(state)
  yield {
    type: EventType.REASONING_START,
    messageId: state.reasoningMessageId,
    model: currentModel,
    timestamp,
  }
  yield {
    type: EventType.REASONING_MESSAGE_START,
    messageId: state.reasoningMessageId,
    role: 'reasoning' as const,
    model: currentModel,
    timestamp,
  }
  yield {
    type: EventType.STEP_STARTED,
    stepName: state.stepId,
    stepId: state.stepId,
    model: currentModel,
    timestamp,
    stepType: 'thinking',
  }
}

function* closeReasoning(
  state: ResponsesStreamState,
): Generator<AdapterYieldChunk> {
  const reasoningMessageId = state.reasoningMessageId
  const shouldSkipCloseReasoning =
    !reasoningMessageId || state.hasClosedReasoning
  if (shouldSkipCloseReasoning) return
  state.hasClosedReasoning = true
  const timestamp = Date.now()
  const currentModel = emitModel(state)
  yield {
    type: EventType.REASONING_MESSAGE_END,
    messageId: reasoningMessageId,
    model: currentModel,
    timestamp,
  }
  yield {
    type: EventType.REASONING_END,
    messageId: reasoningMessageId,
    model: currentModel,
    timestamp,
  }
  if (state.stepId) {
    yield {
      type: EventType.STEP_FINISHED,
      stepName: state.stepId,
      stepId: state.stepId,
      model: currentModel,
      timestamp,
      content: state.accumulatedReasoning,
    }
  }
  state.reasoningMessageId = undefined
  state.stepId = null
  state.hasClosedReasoning = false
  state.accumulatedReasoning = ''
}

function* emitReasoningDelta(
  state: ResponsesStreamState,
  text: string,
): Generator<AdapterYieldChunk> {
  if (!text) return
  yield* openReasoning(state)
  if (!state.reasoningMessageId) return
  state.accumulatedReasoning += text
  state.hasStreamedReasoningDeltas = true
  yield {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: state.reasoningMessageId,
    delta: text,
    model: emitModel(state),
    timestamp: Date.now(),
  }
}

function* emitTextMessageEnd(
  state: ResponsesStreamState,
  clear: boolean,
): Generator<AdapterYieldChunk> {
  if (!state.hasEmittedTextMessageStart) return
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId: state.aguiState.messageId,
    model: emitModel(state),
    timestamp: Date.now(),
  }
  if (clear) state.hasEmittedTextMessageStart = false
}

function handleContentPart(
  state: ResponsesStreamState,
  contentPart: ContentPartAddedEventPart,
): AdapterYieldChunk {
  if (contentPart.type === 'output_text') {
    state.accumulatedContent += contentPart.text
    return {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: state.aguiState.messageId,
      model: emitModel(state),
      timestamp: Date.now(),
      delta: contentPart.text,
      content: state.accumulatedContent,
    }
  }

  if (contentPart.type === 'refusal') {
    const message = contentPart.refusal || 'Refused without explanation'
    return {
      type: EventType.RUN_ERROR,
      model: emitModel(state),
      timestamp: Date.now(),
      message,
      code: 'refusal',
      error: { message, code: 'refusal' },
    }
  }

  const code = contentPart.type
  const message = `Unsupported response content_part type: ${code}`
  return {
    type: EventType.RUN_ERROR,
    model: emitModel(state),
    timestamp: Date.now(),
    message,
    code,
    error: { message, code },
  }
}

function getOrCreateFunctionCallMeta(
  state: ResponsesStreamState,
  item: FunctionCallItem,
  fallbackIndex: number,
): StreamedFunctionCallMetadata {
  const existing = state.toolCallMetadata.get(item.id)
  if (!existing) {
    const created: StreamedFunctionCallMetadata = {
      callId: item.callId || item.id,
      index: fallbackIndex,
      itemId: item.id,
      name: item.name || '',
      started: false,
    }
    state.toolCallMetadata.set(item.id, created)
    return created
  }
  if (item.callId) existing.callId = item.callId
  if (!existing.name && item.name) existing.name = item.name
  return existing
}

function* maybeStartFunctionCall(
  state: ResponsesStreamState,
  metadata: StreamedFunctionCallMetadata,
  index: number,
): Generator<AdapterYieldChunk> {
  const toolName = metadata.name
  const alreadyStartedOrUnnamed = metadata.started || !toolName
  if (alreadyStartedOrUnnamed) return
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId: metadata.callId,
    toolCallName: toolName,
    toolName: toolName,
    parentMessageId: state.aguiState.messageId,
    model: emitModel(state),
    timestamp: Date.now(),
    index,
    metadata: {
      itemId: metadata.itemId,
    } satisfies OpenRouterResponsesToolCallMetadata,
  }
  metadata.started = true
}

function parseToolInput(
  rawArgs: string | undefined,
  state: ResponsesStreamState,
  details: {
    toolCallId: string
    itemId: string
    toolName: string
    logSuffix: string
  },
): unknown {
  if (!rawArgs) return {}
  try {
    const parsed = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (parseError) {
    state.options.logger.errors(
      `${state.adapterName}.processStreamChunks tool-args JSON parse failed${details.logSuffix}`,
      {
        error: toRunErrorPayload(
          parseError,
          `tool ${details.toolName} (${details.toolCallId}) returned malformed JSON arguments`,
        ),
        source: `${state.adapterName}.processStreamChunks`,
        toolCallId: details.toolCallId,
        itemId: details.itemId,
        toolName: details.toolName,
        rawArguments: rawArgs,
      },
    )
    return {}
  }
}

function* endFunctionCall(
  state: ResponsesStreamState,
  metadata: StreamedFunctionCallMetadata,
  rawArgs: string | undefined,
  itemId: string,
  logSuffix: string,
): Generator<AdapterYieldChunk> {
  const name = metadata.name || ''
  metadata.ended = true
  const parsedInput = parseToolInput(rawArgs, state, {
    toolCallId: metadata.callId,
    itemId,
    toolName: name,
    logSuffix,
  })
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId: metadata.callId,
    toolCallName: name,
    toolName: name,
    model: emitModel(state),
    timestamp: Date.now(),
    input: parsedInput,
  }
  metadata.pendingArguments = undefined
}

function functionCallRawArgs(
  item: FunctionCallItem,
  metadata: StreamedFunctionCallMetadata,
): string | undefined {
  if (typeof item.arguments === 'string' && item.arguments.length > 0) {
    return item.arguments
  }
  return metadata.pendingArguments
}

function handleResponseCreated(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): void {
  if (chunk.response?.model) state.model = chunk.response.model
  state.hasStreamedContentDeltas = false
  state.hasStreamedReasoningDeltas = false
  state.hasEmittedTextMessageStart = false
  state.reasoningMessageId = undefined
  state.hasClosedReasoning = false
  state.stepId = null
  state.accumulatedContent = ''
  state.accumulatedReasoning = ''
}

function handleResponseInProgress(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): void {
  if (chunk.response?.model) state.model = chunk.response.model
}

function* handleFailedOrIncomplete(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (chunk.response?.model) state.model = chunk.response.model
  yield* closeReasoning(state)
  yield* emitTextMessageEnd(state, true)
  const errorMessage =
    chunk.response?.error?.message ||
    chunk.response?.incompleteDetails?.reason ||
    (chunk.type === 'response.failed'
      ? 'Response failed'
      : 'Response ended incomplete')
  const errorCode =
    normalizeCode(chunk.response?.error?.code) ??
    (chunk.response?.incompleteDetails ? 'incomplete' : undefined) ??
    undefined
  const rawError = chunk.response?.error
  yield {
    type: EventType.RUN_ERROR,
    model: state.model,
    timestamp: Date.now(),
    message: errorMessage,
    ...(errorCode !== undefined && { code: errorCode }),
    ...(rawError != null && { rawEvent: rawError }),
    error: {
      message: errorMessage,
      ...(errorCode !== undefined && { code: errorCode }),
    },
  }
  state.runFinishedEmitted = true
  state.stop = true
}

function* handleOutputTextDelta(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (!chunk.delta) return
  const textDelta = streamDeltaToString(chunk.delta)
  if (!textDelta) return
  yield* closeReasoning(state)
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: state.aguiState.messageId,
      model: emitModel(state),
      timestamp: Date.now(),
      role: 'assistant',
    }
  }
  state.accumulatedContent += textDelta
  state.hasStreamedContentDeltas = true
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: state.aguiState.messageId,
    model: emitModel(state),
    timestamp: Date.now(),
    delta: textDelta,
    content: state.accumulatedContent,
  }
}

function* handleOutputTextDone(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const completedText = chunk.text
  if (!completedText) return
  if (state.accumulatedContent.length !== 0) return
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: state.aguiState.messageId,
      model: emitModel(state),
      timestamp: Date.now(),
      role: 'assistant',
    }
  }
  state.accumulatedContent = completedText
  state.hasStreamedContentDeltas = true
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: state.aguiState.messageId,
    model: emitModel(state),
    timestamp: Date.now(),
    delta: completedText,
    content: state.accumulatedContent,
  }
}

function* handleReasoningTextDelta(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (!chunk.delta) return
  yield* emitReasoningDelta(state, streamDeltaToString(chunk.delta))
}

function* handleReasoningSummaryDelta(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (!chunk.delta) return
  const summaryDelta = typeof chunk.delta === 'string' ? chunk.delta : ''
  yield* emitReasoningDelta(state, summaryDelta)
}

function* startTextIfNeeded(
  state: ResponsesStreamState,
): Generator<AdapterYieldChunk> {
  if (state.hasEmittedTextMessageStart) return
  yield* closeReasoning(state)
  state.hasEmittedTextMessageStart = true
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: state.aguiState.messageId,
    model: emitModel(state),
    timestamp: Date.now(),
    role: 'assistant',
  }
}

function* handleContentPartAdded(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (!chunk.part) return
  const contentPart = chunk.part
  const isEmptyStreamableText =
    (contentPart.type === 'output_text' ||
      contentPart.type === 'reasoning_text') &&
    !contentPart.text
  if (isEmptyStreamableText) {
    return
  }
  if (contentPart.type === 'reasoning_text') {
    yield* emitReasoningDelta(state, contentPart.text)
    return
  }
  if (contentPart.type === 'output_text') {
    yield* startTextIfNeeded(state)
    state.hasStreamedContentDeltas = true
  }
  const partChunk = handleContentPart(state, contentPart)
  yield partChunk
  if (partChunk.type === 'RUN_ERROR') {
    state.runFinishedEmitted = true
    state.stop = true
  }
}

function* handleContentPartDone(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (!chunk.part) return
  const contentPart = chunk.part
  const alreadyStreamedOutputText =
    contentPart.type === 'output_text' && state.hasStreamedContentDeltas
  if (alreadyStreamedOutputText) {
    return
  }
  const alreadyStreamedReasoningText =
    contentPart.type === 'reasoning_text' && state.hasStreamedReasoningDeltas
  if (alreadyStreamedReasoningText) {
    return
  }
  if (contentPart.type === 'reasoning_text') {
    yield* emitReasoningDelta(state, contentPart.text)
    return
  }
  if (contentPart.type === 'output_text') {
    yield* startTextIfNeeded(state)
  }
  const doneChunk = handleContentPart(state, contentPart)
  yield doneChunk
  if (doneChunk.type === 'RUN_ERROR') {
    state.runFinishedEmitted = true
    state.stop = true
  }
}

function* handleOutputItemAdded(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const item = chunk.item
  if (item?.type !== 'function_call') return
  if (!item.id) return
  const metadata = getOrCreateFunctionCallMeta(
    state,
    item as FunctionCallItem,
    chunk.outputIndex ?? 0,
  )
  yield* maybeStartFunctionCall(state, metadata, chunk.outputIndex ?? 0)
}

function* handleFunctionCallArgsDelta(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  if (!chunk.delta) return
  const itemId = chunk.itemId ?? ''
  const metadata = state.toolCallMetadata.get(itemId)
  if (!metadata?.started) {
    state.options.logger.errors(
      `${state.adapterName}.processStreamChunks orphan function_call_arguments.delta`,
      {
        source: `${state.adapterName}.processStreamChunks`,
        itemId,
        rawDelta: chunk.delta,
      },
    )
    return
  }
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: metadata.callId,
    model: emitModel(state),
    timestamp: Date.now(),
    delta: typeof chunk.delta === 'string' ? chunk.delta : '',
  }
}

function* handleFunctionCallArgsDone(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const itemId = chunk.itemId ?? ''
  const metadata = state.toolCallMetadata.get(itemId)
  if (!metadata?.started) {
    if (metadata) {
      metadata.pendingArguments = chunk.arguments
    }
    state.options.logger.errors(
      `${state.adapterName}.processStreamChunks deferring function_call_arguments.done — TOOL_CALL_START not yet emitted (waiting for name)`,
      {
        source: `${state.adapterName}.processStreamChunks`,
        ...(metadata && { toolCallId: metadata.callId }),
        itemId,
        rawArguments: chunk.arguments,
      },
    )
    return
  }
  if (metadata.ended) return
  yield* endFunctionCall(state, metadata, chunk.arguments, itemId, '')
}

function* handleOutputItemDone(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const item = chunk.item
  if (item?.type !== 'function_call') return
  const itemId = item.id
  if (!itemId) return
  const metadata = getOrCreateFunctionCallMeta(
    state,
    item as FunctionCallItem,
    chunk.outputIndex ?? 0,
  )
  yield* maybeStartFunctionCall(state, metadata, metadata.index)
  const rawArgs = functionCallRawArgs(item as FunctionCallItem, metadata)
  if (metadata.started && !metadata.ended && rawArgs !== undefined) {
    yield* endFunctionCall(
      state,
      metadata,
      rawArgs,
      itemId,
      ' (output_item.done backfill)',
    )
  }
}

function completedTextFromResponse(
  responseObj: Partial<OpenResponsesResult>,
  outputItems: Array<OutputItems>,
): string {
  const outputItemText = outputItems
    .flatMap((item) =>
      item.type === 'message' && Array.isArray(item.content)
        ? item.content
        : [],
    )
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('')
  if (
    typeof responseObj.outputText === 'string' &&
    responseObj.outputText.length > 0
  ) {
    return responseObj.outputText
  }
  return outputItemText
}

function* backfillCompletedText(
  state: ResponsesStreamState,
  completedText: string,
): Generator<AdapterYieldChunk> {
  const hasStreamedOrEmptyCompletedText =
    state.accumulatedContent.length !== 0 || completedText.length === 0
  if (hasStreamedOrEmptyCompletedText) {
    return
  }
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: state.aguiState.messageId,
      model: emitModel(state),
      timestamp: Date.now(),
      role: 'assistant',
    }
  }
  state.accumulatedContent = completedText
  state.hasStreamedContentDeltas = true
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: state.aguiState.messageId,
    model: emitModel(state),
    timestamp: Date.now(),
    delta: completedText,
    content: state.accumulatedContent,
  }
}

function* backfillCompletedFunctionCalls(
  state: ResponsesStreamState,
  outputItems: Array<OutputItems>,
): Generator<AdapterYieldChunk> {
  for (const item of outputItems) {
    if (item.type !== 'function_call') continue
    const itemId = item.id
    if (!itemId) continue
    const metadata = getOrCreateFunctionCallMeta(
      state,
      item as FunctionCallItem,
      0,
    )
    yield* maybeStartFunctionCall(state, metadata, metadata.index)
    const rawArgs = functionCallRawArgs(item as FunctionCallItem, metadata)
    if (metadata.started && !metadata.ended) {
      yield* endFunctionCall(
        state,
        metadata,
        rawArgs,
        itemId,
        ' (response.completed backfill)',
      )
    }
  }
}

function completedFinishReason(
  outputItems: Array<OutputItems>,
  incompleteReason: string | undefined,
): 'tool_calls' | 'length' | 'content_filter' | 'stop' {
  if (outputItems.some((item) => item.type === 'function_call')) {
    return 'tool_calls'
  }
  if (incompleteReason === 'max_output_tokens') return 'length'
  if (incompleteReason === 'content_filter') return 'content_filter'
  return 'stop'
}

function* handleResponseCompleted(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const responseObj = chunk.response ?? {}
  const outputItems = Array.isArray(responseObj.output)
    ? responseObj.output
    : []
  yield* backfillCompletedText(
    state,
    completedTextFromResponse(responseObj, outputItems),
  )
  yield* backfillCompletedFunctionCalls(state, outputItems)
  yield* closeReasoning(state)
  yield* emitTextMessageEnd(state, true)
  yield {
    type: EventType.RUN_FINISHED,
    runId: state.aguiState.runId,
    threadId: state.aguiState.threadId,
    model: emitModel(state),
    timestamp: Date.now(),
    usage: {
      promptTokens: responseObj.usage?.inputTokens || 0,
      completionTokens: responseObj.usage?.outputTokens || 0,
      totalTokens: responseObj.usage?.totalTokens || 0,
      ...extractUsageCost(responseObj.usage),
    },
    finishReason: completedFinishReason(
      outputItems,
      responseObj.incompleteDetails?.reason,
    ),
  }
  state.runFinishedEmitted = true
}

function* handleErrorEvent(
  state: ResponsesStreamState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const code = normalizeCode(chunk.code)
  yield {
    type: EventType.RUN_ERROR,
    model: emitModel(state),
    timestamp: Date.now(),
    message: chunk.message ?? '',
    ...(code !== undefined && { code }),
    error: {
      message: chunk.message ?? '',
      ...(code !== undefined && { code }),
    },
  }
  state.runFinishedEmitted = true
  state.stop = true
}

const STREAM_HANDLERS: Record<string, StreamHandler> = {
  'response.created': handleResponseCreated,
  'response.in_progress': handleResponseInProgress,
  'response.failed': handleFailedOrIncomplete,
  'response.incomplete': handleFailedOrIncomplete,
  'response.output_text.delta': handleOutputTextDelta,
  'response.output_text.done': handleOutputTextDone,
  'response.reasoning_text.delta': handleReasoningTextDelta,
  'response.reasoning_summary_text.delta': handleReasoningSummaryDelta,
  'response.content_part.added': handleContentPartAdded,
  'response.content_part.done': handleContentPartDone,
  'response.output_item.added': handleOutputItemAdded,
  'response.function_call_arguments.delta': handleFunctionCallArgsDelta,
  'response.function_call_arguments.done': handleFunctionCallArgsDone,
  'response.output_item.done': handleOutputItemDone,
  'response.completed': handleResponseCompleted,
  error: handleErrorEvent,
}

function* finishIfNeeded(
  state: ResponsesStreamState,
): Generator<AdapterYieldChunk> {
  const shouldSkipFinish =
    state.runFinishedEmitted || !state.aguiState.hasEmittedRunStarted
  if (shouldSkipFinish) return
  yield* closeReasoning(state)
  yield* emitTextMessageEnd(state, false)
  yield {
    type: EventType.RUN_FINISHED,
    runId: state.aguiState.runId,
    threadId: state.aguiState.threadId,
    model: emitModel(state),
    timestamp: Date.now(),
    finishReason: state.toolCallMetadata.size > 0 ? 'tool_calls' : 'stop',
  }
}

function* emitProcessStreamError(
  error: unknown,
  state: ResponsesStreamState,
): Generator<AdapterYieldChunk> {
  const errorPayload = toRunErrorPayload(
    error,
    `${state.adapterName}.processStreamChunks failed`,
  )
  const rawEvent = toRunErrorRawEvent(error)
  state.options.logger.errors(
    `${state.adapterName}.processStreamChunks fatal`,
    {
      error: errorPayload,
      source: `${state.adapterName}.processStreamChunks`,
    },
  )
  yield {
    type: EventType.RUN_ERROR,
    model: state.options.model,
    timestamp: Date.now(),
    message: errorPayload.message,
    ...(errorPayload.code !== undefined && { code: errorPayload.code }),
    ...(rawEvent !== undefined && { rawEvent }),
    error: {
      message: errorPayload.message,
      ...(errorPayload.code !== undefined && { code: errorPayload.code }),
    },
  }
}

export async function* processResponsesStreamChunks(args: {
  stream: AsyncIterable<StreamEvents>
  toolCallMetadata: Map<string, StreamedFunctionCallMetadata>
  options: ResponsesLoopOptions
  aguiState: ResponsesAguiState
  adapterName: string
}): AsyncIterable<AdapterYieldChunk> {
  const state: ResponsesStreamState = {
    adapterName: args.adapterName,
    options: args.options,
    aguiState: args.aguiState,
    toolCallMetadata: args.toolCallMetadata,
    accumulatedContent: '',
    accumulatedReasoning: '',
    hasStreamedContentDeltas: false,
    hasStreamedReasoningDeltas: false,
    model: args.options.model,
    stepId: null,
    hasEmittedTextMessageStart: false,
    reasoningMessageId: undefined,
    hasClosedReasoning: false,
    runFinishedEmitted: false,
    stop: false,
  }
  try {
    for await (const rawEvent of args.stream) {
      const chunk = normalizeStreamEvent(rawEvent)
      args.options.logger.provider(
        `provider=${args.adapterName} type=${chunk.type}`,
        { provider: args.adapterName, type: chunk.type },
      )
      yield* emitRunStartedIfNeeded(
        state.aguiState,
        state.model || args.options.model,
        args.options.parentRunId,
      )
      const handler = STREAM_HANDLERS[chunk.type]
      if (!handler) continue
      const produced = handler(state, chunk)
      if (produced) yield* produced
      if (state.stop) return
    }
    yield* finishIfNeeded(state)
  } catch (error: unknown) {
    yield* emitProcessStreamError(error, state)
  }
}

function* openStructuredReasoning(
  state: ResponsesStructuredState,
): Generator<AdapterYieldChunk> {
  if (state.reasoningMessageId) return
  state.reasoningMessageId = generateId(state.adapterName)
  state.stepId = generateId(state.adapterName)
  yield {
    type: EventType.REASONING_START,
    messageId: state.reasoningMessageId,
    model: state.model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.REASONING_MESSAGE_START,
    messageId: state.reasoningMessageId,
    role: 'reasoning' as const,
    model: state.model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.STEP_STARTED,
    stepName: state.stepId,
    stepId: state.stepId,
    model: state.model,
    timestamp: Date.now(),
    stepType: 'thinking',
  }
}

function* closeStructuredReasoning(
  state: ResponsesStructuredState,
): Generator<AdapterYieldChunk> {
  const reasoningMessageId = state.reasoningMessageId
  const shouldSkipCloseReasoning =
    !reasoningMessageId || state.hasClosedReasoning
  if (shouldSkipCloseReasoning) return
  state.hasClosedReasoning = true
  yield {
    type: EventType.REASONING_MESSAGE_END,
    messageId: reasoningMessageId,
    model: state.model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.REASONING_END,
    messageId: reasoningMessageId,
    model: state.model,
    timestamp: Date.now(),
  }
  if (state.stepId) {
    yield {
      type: EventType.STEP_FINISHED,
      stepName: state.stepId,
      stepId: state.stepId,
      model: state.model,
      timestamp: Date.now(),
      content: state.accumulatedReasoning,
    }
  }
  state.reasoningMessageId = undefined
  state.stepId = undefined
  state.hasClosedReasoning = false
}

function handleStructuredCreated(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
): void {
  if (chunk.response?.model) state.model = chunk.response.model
}

function* handleStructuredRefusal(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
  aguiState: ResponsesAguiState,
): Generator<AdapterYieldChunk> {
  const delta = typeof chunk.delta === 'string' ? chunk.delta : ''
  yield {
    type: EventType.RUN_ERROR,
    runId: aguiState.runId,
    model: state.model,
    timestamp: Date.now(),
    message: `Model refused: ${delta}`,
    code: 'refusal',
    error: { message: `Model refused: ${delta}`, code: 'refusal' },
  }
  state.stop = true
}

function* handleStructuredReasoning(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
): Generator<AdapterYieldChunk> {
  const reasoningDelta = streamDeltaToString(chunk.delta)
  if (!reasoningDelta) return
  yield* openStructuredReasoning(state)
  if (!state.reasoningMessageId) return
  state.accumulatedReasoning += reasoningDelta
  yield {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: state.reasoningMessageId,
    delta: reasoningDelta,
    model: state.model,
    timestamp: Date.now(),
  }
}

function* handleStructuredTextDelta(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
  aguiState: ResponsesAguiState,
): Generator<AdapterYieldChunk> {
  const textDelta = streamDeltaToString(chunk.delta)
  if (!textDelta) return
  yield* closeStructuredReasoning(state)
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: aguiState.messageId,
      model: state.model,
      timestamp: Date.now(),
      role: 'assistant',
    }
  }
  state.accumulatedContent += textDelta
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: aguiState.messageId,
    model: state.model,
    timestamp: Date.now(),
    delta: textDelta,
    content: state.accumulatedContent,
  }
}

function handleStructuredCompleted(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
): void {
  if (chunk.response?.model) state.model = chunk.response.model
  if (chunk.response?.usage) state.usage = chunk.response.usage
}

function* handleStructuredFailed(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
  aguiState: ResponsesAguiState,
): Generator<AdapterYieldChunk> {
  const message =
    chunk.response?.error?.message ||
    chunk.response?.incompleteDetails?.reason ||
    (chunk.type === 'response.failed'
      ? 'Response failed'
      : 'Response ended incomplete')
  const code =
    normalizeCode(chunk.response?.error?.code) ??
    (chunk.response?.incompleteDetails ? 'incomplete' : undefined)
  const rawError = chunk.response?.error
  yield {
    type: EventType.RUN_ERROR,
    runId: aguiState.runId,
    model: state.model,
    timestamp: Date.now(),
    message,
    ...(code !== undefined && { code }),
    ...(rawError != null && { rawEvent: rawError }),
    error: {
      message,
      ...(code !== undefined && { code }),
    },
  }
  state.stop = true
}

function* handleStructuredError(
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
  aguiState: ResponsesAguiState,
): Generator<AdapterYieldChunk> {
  const code = normalizeCode(chunk.code)
  const message = chunk.message ?? 'Responses API stream error'
  yield {
    type: EventType.RUN_ERROR,
    runId: aguiState.runId,
    model: state.model,
    timestamp: Date.now(),
    message,
    ...(code !== undefined && { code }),
    error: {
      message,
      ...(code !== undefined && { code }),
    },
  }
  state.stop = true
}

type StructuredHandler = (
  state: ResponsesStructuredState,
  chunk: NormalizedStreamEvent,
  aguiState: ResponsesAguiState,
) => Generator<AdapterYieldChunk, void, unknown> | void

const STRUCTURED_HANDLERS: Record<string, StructuredHandler> = {
  'response.created': handleStructuredCreated,
  'response.in_progress': handleStructuredCreated,
  'response.refusal.delta': handleStructuredRefusal,
  'response.reasoning_text.delta': handleStructuredReasoning,
  'response.reasoning_summary_text.delta': handleStructuredReasoning,
  'response.output_text.delta': handleStructuredTextDelta,
  'response.completed': handleStructuredCompleted,
  'response.failed': handleStructuredFailed,
  'response.incomplete': handleStructuredFailed,
  error: handleStructuredError,
}

export function* consumeResponsesStructuredChunk(
  rawEvent: StreamEvents,
  chatOptions: ResponsesLoopOptions,
  aguiState: ResponsesAguiState,
  state: ResponsesStructuredState,
): Generator<AdapterYieldChunk> {
  const chunk = normalizeStreamEvent(rawEvent)
  chatOptions.logger.provider(
    `provider=${state.adapterName} type=${chunk.type}`,
    { provider: state.adapterName, type: chunk.type },
  )
  yield* emitRunStartedIfNeeded(aguiState, state.model, chatOptions.parentRunId)
  const handler = STRUCTURED_HANDLERS[chunk.type]
  if (!handler) return
  const produced = handler(state, chunk, aguiState)
  if (produced) yield* produced
}

export function* finishResponsesStructuredStream(
  aguiState: ResponsesAguiState,
  state: ResponsesStructuredState,
  transform: (parsed: unknown) => unknown,
): Generator<AdapterYieldChunk> {
  yield* closeStructuredReasoning(state)
  if (state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: aguiState.messageId,
      model: state.model,
      timestamp: Date.now(),
    }
  }
  if (state.accumulatedContent.length === 0) {
    yield {
      type: EventType.RUN_ERROR,
      runId: aguiState.runId,
      model: state.model,
      timestamp: Date.now(),
      message: `${state.adapterName}.structuredOutputStream: response contained no content`,
      code: 'empty-response',
      error: {
        message: `${state.adapterName}.structuredOutputStream: response contained no content`,
        code: 'empty-response',
      },
    }
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(state.accumulatedContent)
  } catch {
    yield {
      type: EventType.RUN_ERROR,
      runId: aguiState.runId,
      model: state.model,
      timestamp: Date.now(),
      message: `Failed to parse structured output as JSON. Content: ${state.accumulatedContent.slice(0, 200)}${state.accumulatedContent.length > 200 ? '...' : ''}`,
      code: 'parse-error',
      error: {
        message: 'Failed to parse structured output as JSON',
        code: 'parse-error',
      },
    }
    return
  }
  const transformed = transform(parsed)
  yield {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: {
      object: transformed,
      raw: state.accumulatedContent,
      ...(state.accumulatedReasoning
        ? { reasoning: state.accumulatedReasoning }
        : {}),
    },
    model: state.model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId: aguiState.runId,
    threadId: aguiState.threadId,
    model: state.model,
    timestamp: Date.now(),
    finishReason: 'stop',
    ...(state.usage && {
      usage: {
        promptTokens: state.usage.inputTokens ?? 0,
        completionTokens: state.usage.outputTokens ?? 0,
        totalTokens: state.usage.totalTokens ?? 0,
        ...extractUsageCost(state.usage),
      },
    }),
  }
}

export function* emitResponsesStructuredStreamError(
  error: unknown,
  chatOptions: ResponsesLoopOptions,
  aguiState: ResponsesAguiState,
  state: ResponsesStructuredState,
): Generator<AdapterYieldChunk> {
  yield* emitRunStartedIfNeeded(aguiState, state.model, chatOptions.parentRunId)
  const isAbort = isAbortError(error)
  const errorPayload = toRunErrorPayload(
    error,
    `${state.adapterName}.structuredOutputStream failed`,
  )
  const resolvedCode = isAbort ? 'aborted' : errorPayload.code
  const rawEvent = isAbort ? undefined : toRunErrorRawEvent(error)
  yield {
    type: EventType.RUN_ERROR,
    runId: aguiState.runId,
    model: state.model,
    timestamp: Date.now(),
    message: errorPayload.message,
    ...(resolvedCode !== undefined && { code: resolvedCode }),
    ...(rawEvent !== undefined && { rawEvent }),
    error: {
      message: errorPayload.message,
      ...(resolvedCode !== undefined && { code: resolvedCode }),
    },
  }
  chatOptions.logger.errors(
    `${state.adapterName}.structuredOutputStream fatal`,
    {
      error: errorPayload,
      source: `${state.adapterName}.structuredOutputStream`,
    },
  )
}

function normalizeStreamEvent(event: StreamEvents): NormalizedStreamEvent {
  const e = event as {
    isUnknown?: boolean
    raw?: unknown
    type?: string
    [k: string]: unknown
  }

  if (e.isUnknown && e.raw && typeof e.raw === 'object') {
    return normalizeUnknownStreamEvent(e, e.raw)
  }

  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- NormalizedStreamEvent is a discriminated union; the upstream `event` is a passthrough whose variant TS can't infer here.
  return event as unknown as NormalizedStreamEvent
}

function normalizeUnknownStreamEvent(
  e: { type?: string },
  raw: object,
): NormalizedStreamEvent {
  const rawRecord = raw as Record<string, unknown>
  const out: Record<string, unknown> = { ...rawRecord }
  if ('item_id' in rawRecord) out.itemId = rawRecord.item_id
  if ('output_index' in rawRecord) out.outputIndex = rawRecord.output_index
  if ('content_index' in rawRecord) out.contentIndex = rawRecord.content_index
  if ('sequence_number' in rawRecord)
    out.sequenceNumber = rawRecord.sequence_number
  if ('summary_index' in rawRecord) out.summaryIndex = rawRecord.summary_index
  if (
    'response' in rawRecord &&
    rawRecord['response'] &&
    typeof rawRecord['response'] === 'object'
  ) {
    out['response'] = camelCaseResponseShape(
      rawRecord['response'] as Record<string, unknown>,
    )
  }
  if (
    'item' in rawRecord &&
    rawRecord.item &&
    typeof rawRecord.item === 'object'
  ) {
    out.item = camelCaseOutputItem(rawRecord.item as Record<string, unknown>)
  }
  if ('part' in rawRecord) out.part = rawRecord.part
  out.type =
    typeof rawRecord['type'] === 'string'
      ? rawRecord['type']
      : e.type || 'unknown'
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- NormalizedStreamEvent is a discriminated union built field-by-field from Record<string, unknown>; TS can't narrow the variant from construction.
  return out as unknown as NormalizedStreamEvent
}

/** Translate snake_case keys in a `response` payload to camelCase for the
 *  fields our terminal-event handlers read. Unknown keys passthrough. */
function camelCaseResponseShape(
  src: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...src }
  if ('incomplete_details' in src)
    out.incompleteDetails = src.incomplete_details
  if ('output_text' in src) out.outputText = src.output_text
  const hasTopLevelTokenCounts =
    'input_tokens' in src || 'output_tokens' in src || 'total_tokens' in src
  if (hasTopLevelTokenCounts) {
    // never mutate src; rewrite usage in place if present.
  }
  if (src.usage && typeof src.usage === 'object') {
    const u = src.usage as Record<string, unknown>
    out.usage = {
      ...u,
      ...('input_tokens' in u && { inputTokens: u.input_tokens }),
      ...('output_tokens' in u && { outputTokens: u.output_tokens }),
      ...('total_tokens' in u && { totalTokens: u.total_tokens }),
    }
  }
  if (Array.isArray(src.output)) {
    out.output = src.output.map((item) =>
      item && typeof item === 'object'
        ? camelCaseOutputItem(item as Record<string, unknown>)
        : item,
    )
  }
  return out
}

/** Translate snake_case keys in an output item to camelCase. */
function camelCaseOutputItem(
  src: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...src }
  if ('call_id' in src) out.callId = src.call_id
  return out
}

/** Normalize an `error.code` to the string slot our RUN_ERROR event reads. */
function normalizeCode(code: unknown): string | undefined {
  if (typeof code === 'string') return code
  if (typeof code === 'number' && Number.isFinite(code)) return String(code)
  return undefined
}
