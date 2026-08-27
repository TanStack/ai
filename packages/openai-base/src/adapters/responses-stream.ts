import { EventType } from '@tanstack/ai'
import { generateId } from '@tanstack/ai-utils'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { createToolInputNormalizer } from '../utils/tool-input-normalizer'
import { buildResponsesUsage } from '../usage'
import type { StructuredOutputCompatibility } from '../utils/schema-converter'
import type { AdapterYieldChunk, TextOptions } from '@tanstack/ai'
import type {
  ResponseStreamEvent,
  ResponseFunctionToolCall,
} from 'openai/resources/responses/responses'

export interface LegacyReasoningDeltaEvent {
  type: 'response.reasoning.delta'
  delta?: unknown
}

export interface StreamedFunctionCallMetadata {
  callId: string
  index: number
  name: string
  started: boolean
  ended?: boolean
  pendingArguments?: string | undefined
}

type ResponsesAguiState = {
  runId: string
  threadId: string
  messageId: string
  hasEmittedRunStarted: boolean
}

export type ResponsesStreamChunk =
  | ResponseStreamEvent
  | LegacyReasoningDeltaEvent

type ToolInputNormalizer = (toolName: string, input: unknown) => unknown

interface ResponsesStreamState {
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

interface ResponsesStreamContext {
  adapterName: string
  options: TextOptions
  aguiState: ResponsesAguiState
  toolCallMetadata: Map<string, StreamedFunctionCallMetadata>
  normalizeToolInput: ToolInputNormalizer
  state: ResponsesStreamState
}

type StreamHandler = (
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
) => Generator<AdapterYieldChunk> | void

interface ProcessResponsesStreamArgs {
  stream: AsyncIterable<ResponsesStreamChunk>
  toolCallMetadata: Map<string, StreamedFunctionCallMetadata>
  options: TextOptions
  aguiState: ResponsesAguiState
  adapterName: string
  toCompatibility: (
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ) => StructuredOutputCompatibility
}

function emitModel(ctx: ResponsesStreamContext): string {
  return ctx.state.model || ctx.options.model
}

function joinDelta(delta: unknown): string {
  if (Array.isArray(delta)) return delta.join('')
  if (typeof delta === 'string') return delta
  return ''
}

function* openReasoning(
  ctx: ResponsesStreamContext,
): Generator<AdapterYieldChunk> {
  if (ctx.state.reasoningMessageId) return
  ctx.state.reasoningMessageId = generateId(ctx.adapterName)
  ctx.state.stepId = generateId(ctx.adapterName)
  const timestamp = Date.now()
  const currentModel = emitModel(ctx)
  yield {
    type: EventType.REASONING_START,
    messageId: ctx.state.reasoningMessageId,
    model: currentModel,
    timestamp,
  }
  yield {
    type: EventType.REASONING_MESSAGE_START,
    messageId: ctx.state.reasoningMessageId,
    role: 'reasoning' as const,
    model: currentModel,
    timestamp,
  }
  yield {
    type: EventType.STEP_STARTED,
    stepName: ctx.state.stepId,
    stepId: ctx.state.stepId,
    model: currentModel,
    timestamp,
    stepType: 'thinking',
  }
}

function* closeReasoning(
  ctx: ResponsesStreamContext,
): Generator<AdapterYieldChunk> {
  const reasoningMessageId = ctx.state.reasoningMessageId
  const shouldSkipCloseReasoning =
    !reasoningMessageId || ctx.state.hasClosedReasoning
  if (shouldSkipCloseReasoning) return
  ctx.state.hasClosedReasoning = true
  const timestamp = Date.now()
  const currentModel = emitModel(ctx)
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
  if (ctx.state.stepId) {
    yield {
      type: EventType.STEP_FINISHED,
      stepName: ctx.state.stepId,
      stepId: ctx.state.stepId,
      model: currentModel,
      timestamp,
      content: ctx.state.accumulatedReasoning,
    }
  }
  ctx.state.reasoningMessageId = undefined
  ctx.state.stepId = null
  ctx.state.hasClosedReasoning = false
  ctx.state.accumulatedReasoning = ''
}

function* emitReasoningDelta(
  ctx: ResponsesStreamContext,
  text: string,
): Generator<AdapterYieldChunk> {
  if (!text) return
  yield* openReasoning(ctx)
  if (!ctx.state.reasoningMessageId) return
  ctx.state.accumulatedReasoning += text
  ctx.state.hasStreamedReasoningDeltas = true
  yield {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: ctx.state.reasoningMessageId,
    delta: text,
    model: emitModel(ctx),
    timestamp: Date.now(),
  }
}

function* emitTextMessageStart(
  ctx: ResponsesStreamContext,
): Generator<AdapterYieldChunk> {
  ctx.state.hasEmittedTextMessageStart = true
  yield {
    type: EventType.TEXT_MESSAGE_START,
    messageId: ctx.aguiState.messageId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    role: 'assistant',
  }
}

function* emitTextMessageEnd(
  ctx: ResponsesStreamContext,
  model: string,
): Generator<AdapterYieldChunk> {
  yield {
    type: EventType.TEXT_MESSAGE_END,
    messageId: ctx.aguiState.messageId,
    model,
    timestamp: Date.now(),
  }
  ctx.state.hasEmittedTextMessageStart = false
}

function* emitRunStartedIfNeeded(
  ctx: ResponsesStreamContext,
): Generator<AdapterYieldChunk> {
  if (ctx.aguiState.hasEmittedRunStarted) return
  ctx.aguiState.hasEmittedRunStarted = true
  yield {
    type: EventType.RUN_STARTED,
    runId: ctx.aguiState.runId,
    threadId: ctx.aguiState.threadId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    parentRunId: ctx.options.parentRunId,
  }
}

function handleContentPart(
  ctx: ResponsesStreamContext,
  contentPart: {
    type: string
    text?: string
    refusal?: string
  },
): AdapterYieldChunk {
  if (contentPart.type === 'output_text') {
    ctx.state.accumulatedContent += contentPart.text || ''
    return {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: ctx.aguiState.messageId,
      model: emitModel(ctx),
      timestamp: Date.now(),
      delta: contentPart.text || '',
      content: ctx.state.accumulatedContent,
    }
  }

  const isRefusal = contentPart.type === 'refusal'
  const message = isRefusal
    ? contentPart.refusal || 'Refused without explanation'
    : `Unsupported response content_part type: ${contentPart.type}`
  const code = isRefusal ? 'refusal' : contentPart.type
  return {
    type: EventType.RUN_ERROR,
    model: emitModel(ctx),
    timestamp: Date.now(),
    message,
    code,
    error: { message, code },
  }
}

function upsertFunctionCallMetadata(
  ctx: ResponsesStreamContext,
  item: {
    id?: string
    call_id?: string
    name?: string
  },
  index: number,
): StreamedFunctionCallMetadata | undefined {
  const id = item.id
  if (!id) return undefined
  const existing = ctx.toolCallMetadata.get(id)
  if (!existing) {
    const metadata: StreamedFunctionCallMetadata = {
      callId: item.call_id || id,
      index,
      name: item.name || '',
      started: false,
    }
    ctx.toolCallMetadata.set(id, metadata)
    return metadata
  }
  if (item.call_id) existing.callId = item.call_id
  if (!existing.name && item.name) {
    existing.name = item.name
  }
  return existing
}

function* emitToolCallStart(
  ctx: ResponsesStreamContext,
  metadata: StreamedFunctionCallMetadata,
  itemId: string,
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
    parentMessageId: ctx.aguiState.messageId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    index,
    metadata: {
      itemId,
    },
  }
  metadata.started = true
}

function parseAndNormalizeArgs(
  ctx: ResponsesStreamContext,
  rawArgs: string | undefined,
  name: string,
  callId: string,
  logSuffix: string,
  extra: { itemId: string },
): unknown {
  let parsedInput: unknown = {}
  if (!rawArgs) return parsedInput
  try {
    const parsed = JSON.parse(rawArgs)
    parsedInput = ctx.normalizeToolInput(
      name,
      parsed && typeof parsed === 'object' ? parsed : {},
    )
  } catch (parseError) {
    ctx.options.logger.errors(
      `${ctx.adapterName}.processStreamChunks tool-args JSON parse failed${logSuffix}`,
      {
        error: toRunErrorPayload(
          parseError,
          `tool ${name} (${callId}) returned malformed JSON arguments`,
        ),
        source: `${ctx.adapterName}.processStreamChunks`,
        toolCallId: callId,
        itemId: extra.itemId,
        toolName: name,
        rawArguments: rawArgs,
      },
    )
    parsedInput = {}
  }
  return parsedInput
}

function toolCallEndChunk(
  ctx: ResponsesStreamContext,
  metadata: StreamedFunctionCallMetadata,
  parsedInput: unknown,
): AdapterYieldChunk {
  const name = metadata.name || ''
  return {
    type: EventType.TOOL_CALL_END,
    toolCallId: metadata.callId,
    toolCallName: name,
    toolName: name,
    model: emitModel(ctx),
    timestamp: Date.now(),
    input: parsedInput,
  }
}

function handleCreated(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): void {
  if (chunk.type !== 'response.created') return
  ctx.state.model = chunk.response.model
  ctx.state.hasStreamedContentDeltas = false
  ctx.state.hasStreamedReasoningDeltas = false
  ctx.state.hasEmittedTextMessageStart = false
  ctx.state.reasoningMessageId = undefined
  ctx.state.hasClosedReasoning = false
  ctx.state.stepId = null
  ctx.state.accumulatedContent = ''
  ctx.state.accumulatedReasoning = ''
}

function* handleFailedOrIncomplete(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  const isTerminalFailure =
    chunk.type === 'response.failed' || chunk.type === 'response.incomplete'
  if (!isTerminalFailure) {
    return
  }
  if (!('response' in chunk)) return
  ctx.state.model = chunk.response.model
  yield* closeReasoning(ctx)
  if (ctx.state.hasEmittedTextMessageStart) {
    yield* emitTextMessageEnd(ctx, chunk.response.model)
  }
  const errorMessage =
    chunk.response.error?.message ||
    chunk.response.incomplete_details?.reason ||
    (chunk.type === 'response.failed'
      ? 'Response failed'
      : 'Response ended incomplete')
  const errorCode =
    chunk.response.error?.code ??
    (chunk.response.incomplete_details ? 'incomplete' : undefined) ??
    undefined
  yield {
    type: EventType.RUN_ERROR,
    model: chunk.response.model,
    timestamp: Date.now(),
    message: errorMessage,
    ...(errorCode !== undefined && { code: errorCode }),
    error: {
      message: errorMessage,
      ...(errorCode !== undefined && { code: errorCode }),
    },
  }
  // RUN_ERROR is the terminal event for this run; stop processing
  // any further chunks the iterator might still deliver.
  ctx.state.runFinishedEmitted = true
  ctx.state.stop = true
}

function* handleOutputTextDelta(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  const isOutputTextDelta =
    chunk.type === 'response.output_text.delta' && chunk.delta
  if (!isOutputTextDelta) return
  const textDelta = joinDelta(chunk.delta)
  if (!textDelta) return
  yield* closeReasoning(ctx)
  if (!ctx.state.hasEmittedTextMessageStart) {
    yield* emitTextMessageStart(ctx)
  }
  ctx.state.accumulatedContent += textDelta
  ctx.state.hasStreamedContentDeltas = true
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: ctx.aguiState.messageId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    delta: textDelta,
    content: ctx.state.accumulatedContent,
  }
}

function* handleReasoningTextDelta(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  const isReasoningTextDelta =
    (chunk.type === 'response.reasoning_text.delta' ||
      chunk.type === 'response.reasoning.delta') &&
    chunk.delta
  if (!isReasoningTextDelta) {
    return
  }
  yield* emitReasoningDelta(ctx, joinDelta(chunk.delta))
}

function* handleReasoningSummaryDelta(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  const isReasoningSummaryDelta =
    chunk.type === 'response.reasoning_summary_text.delta' && chunk.delta
  if (!isReasoningSummaryDelta) {
    return
  }
  const summaryDelta = typeof chunk.delta === 'string' ? chunk.delta : ''
  yield* emitReasoningDelta(ctx, summaryDelta)
}

function* handleContentPartAdded(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'response.content_part.added') return
  const contentPart = chunk.part
  const isEmptyStreamableText =
    (contentPart.type === 'output_text' ||
      contentPart.type === 'reasoning_text') &&
    !contentPart.text
  if (isEmptyStreamableText) {
    return
  }
  if (contentPart.type === 'reasoning_text') {
    yield* emitReasoningDelta(ctx, contentPart.text || '')
    return
  }
  if (
    contentPart.type === 'output_text' &&
    !ctx.state.hasEmittedTextMessageStart
  ) {
    yield* closeReasoning(ctx)
    yield* emitTextMessageStart(ctx)
  }
  if (contentPart.type === 'output_text') {
    ctx.state.hasStreamedContentDeltas = true
  }
  const partChunk = handleContentPart(ctx, contentPart)
  yield partChunk
  if (partChunk.type === EventType.RUN_ERROR) {
    ctx.state.runFinishedEmitted = true
    ctx.state.stop = true
  }
}

function* handleContentPartDone(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'response.content_part.done') return
  const contentPart = chunk.part

  // Skip emitting chunks for content parts that we've already streamed via deltas
  // The done event is just a completion marker, not new content
  const alreadyStreamedOutputText =
    contentPart.type === 'output_text' && ctx.state.hasStreamedContentDeltas
  if (alreadyStreamedOutputText) {
    return
  }
  const alreadyStreamedReasoningText =
    contentPart.type === 'reasoning_text' &&
    ctx.state.hasStreamedReasoningDeltas
  if (alreadyStreamedReasoningText) {
    return
  }

  if (contentPart.type === 'reasoning_text') {
    yield* emitReasoningDelta(ctx, contentPart.text || '')
    return
  }
  if (
    contentPart.type === 'output_text' &&
    !ctx.state.hasEmittedTextMessageStart
  ) {
    yield* closeReasoning(ctx)
    yield* emitTextMessageStart(ctx)
  }

  // Only emit if we haven't been streaming deltas (e.g., for non-streaming responses)
  const doneChunk = handleContentPart(ctx, contentPart)
  yield doneChunk
  if (doneChunk.type === EventType.RUN_ERROR) {
    ctx.state.runFinishedEmitted = true
    ctx.state.stop = true
  }
}

function* handleOutputItemAdded(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'response.output_item.added') return
  const item = chunk.item
  const itemId = item.id
  const isFunctionCall = item.type === 'function_call' && itemId
  if (!isFunctionCall) return
  const metadata = upsertFunctionCallMetadata(ctx, item, chunk.output_index)
  if (!metadata) return
  yield* emitToolCallStart(ctx, metadata, itemId, chunk.output_index)
}

function* handleFunctionCallArgsDelta(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  const isFunctionCallArgsDelta =
    chunk.type === 'response.function_call_arguments.delta' && chunk.delta
  if (!isFunctionCallArgsDelta) {
    return
  }
  const metadata = ctx.toolCallMetadata.get(chunk.item_id)
  if (!metadata?.started) {
    ctx.options.logger.errors(
      `${ctx.adapterName}.processStreamChunks orphan function_call_arguments.delta`,
      {
        source: `${ctx.adapterName}.processStreamChunks`,
        // No metadata yet, so the `call_id` is unknown here — only the
        // output item id the delta referenced.
        itemId: chunk.item_id,
        rawDelta: chunk.delta,
      },
    )
    return
  }
  yield {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: metadata.callId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    delta: chunk.delta,
  }
}

function* handleFunctionCallArgsDone(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'response.function_call_arguments.done') return
  const { item_id } = chunk

  // Get the function name from metadata (captured in output_item.added)
  const metadata = ctx.toolCallMetadata.get(item_id)
  if (!metadata?.started) {
    if (metadata) {
      metadata.pendingArguments = chunk.arguments
    }
    ctx.options.logger.errors(
      `${ctx.adapterName}.processStreamChunks deferring function_call_arguments.done — TOOL_CALL_START not yet emitted (waiting for name)`,
      {
        source: `${ctx.adapterName}.processStreamChunks`,
        ...(metadata && { toolCallId: metadata.callId }),
        itemId: item_id,
        rawArguments: chunk.arguments,
      },
    )
    return
  }
  if (metadata.ended) return
  const name = metadata.name || ''
  metadata.ended = true

  const parsedInput = parseAndNormalizeArgs(
    ctx,
    chunk.arguments,
    name,
    metadata.callId,
    '',
    { itemId: item_id },
  )
  yield toolCallEndChunk(ctx, metadata, parsedInput)
}

function functionCallRawArgs(
  item: ResponseFunctionToolCall,
  metadata: StreamedFunctionCallMetadata,
): string | undefined {
  if (typeof item.arguments === 'string' && item.arguments.length > 0) {
    return item.arguments
  }
  return metadata.pendingArguments
}

function* handleOutputItemDone(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'response.output_item.done') return
  const item = chunk.item
  const itemId = item.id
  const isFunctionCall = item.type === 'function_call' && itemId
  if (!isFunctionCall) return
  const metadata = upsertFunctionCallMetadata(ctx, item, chunk.output_index)
  if (!metadata) return
  yield* emitToolCallStart(ctx, metadata, itemId, metadata.index)
  const rawArgs = functionCallRawArgs(
    item as ResponseFunctionToolCall,
    metadata,
  )
  const cannotEndFunctionCall =
    !metadata.started || metadata.ended || rawArgs === undefined
  if (cannotEndFunctionCall) return
  const name = metadata.name || ''
  const parsedInput = parseAndNormalizeArgs(
    ctx,
    rawArgs,
    name,
    metadata.callId,
    ' (output_item.done backfill)',
    { itemId },
  )
  yield toolCallEndChunk(ctx, metadata, parsedInput)
  metadata.ended = true
  metadata.pendingArguments = undefined
}

function* recoverCompletedText(
  ctx: ResponsesStreamContext,
  chunk: Extract<ResponseStreamEvent, { type: 'response.completed' }>,
): Generator<AdapterYieldChunk> {
  const completedText = chunk.response.output
    .flatMap((item) => (item.type === 'message' ? item.content : []))
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text)
    .join('')

  const hasStreamedOrEmptyCompletedText =
    ctx.state.accumulatedContent.length !== 0 || completedText.length === 0
  if (hasStreamedOrEmptyCompletedText) {
    return
  }
  if (!ctx.state.hasEmittedTextMessageStart) {
    yield* emitTextMessageStart(ctx)
  }

  ctx.state.accumulatedContent = completedText
  ctx.state.hasStreamedContentDeltas = true
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: ctx.aguiState.messageId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    delta: completedText,
    content: ctx.state.accumulatedContent,
  }
}

function* backfillCompletedFunctionCall(
  ctx: ResponsesStreamContext,
  item: ResponseFunctionToolCall,
): Generator<AdapterYieldChunk> {
  if (!item.id) return
  const metadata = upsertFunctionCallMetadata(ctx, item, 0)
  if (!metadata) return
  yield* emitToolCallStart(ctx, metadata, item.id, metadata.index)
  const skipBackfill = !metadata.started || metadata.ended
  if (skipBackfill) return
  const name = metadata.name || ''
  const rawArgs = functionCallRawArgs(item, metadata)
  const parsedInput = parseAndNormalizeArgs(
    ctx,
    rawArgs,
    name,
    metadata.callId,
    ' (response.completed backfill)',
    { itemId: item.id },
  )
  yield toolCallEndChunk(ctx, metadata, parsedInput)
  metadata.ended = true
  metadata.pendingArguments = undefined
}

function completedFinishReason(
  output: Array<unknown>,
  incompleteReason: string | undefined,
): 'tool_calls' | 'length' | 'content_filter' | 'stop' {
  const hasFunctionCalls = output.some(
    (item: unknown) => (item as { type: string }).type === 'function_call',
  )
  if (hasFunctionCalls) return 'tool_calls'
  if (incompleteReason === 'max_output_tokens') return 'length'
  if (incompleteReason === 'content_filter') return 'content_filter'
  return 'stop'
}

function* emitCompletedTerminal(
  ctx: ResponsesStreamContext,
  chunk: Extract<ResponseStreamEvent, { type: 'response.completed' }>,
): Generator<AdapterYieldChunk> {
  yield* closeReasoning(ctx)
  if (ctx.state.hasEmittedTextMessageStart) {
    yield* emitTextMessageEnd(ctx, emitModel(ctx))
  }

  const finishReason = completedFinishReason(
    chunk.response.output,
    chunk.response.incomplete_details?.reason,
  )

  yield {
    type: EventType.RUN_FINISHED,
    runId: ctx.aguiState.runId,
    threadId: ctx.aguiState.threadId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    // Omit usage entirely when the provider reported none rather than
    // emitting fabricated zeros (also satisfies exactOptionalPropertyTypes).
    ...(chunk.response.usage && {
      usage: buildResponsesUsage(chunk.response.usage),
    }),
    finishReason,
  }
  ctx.state.runFinishedEmitted = true
}

function* handleCompleted(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'response.completed') return
  yield* recoverCompletedText(ctx, chunk)
  for (const item of chunk.response.output) {
    if (item.type !== 'function_call') continue
    yield* backfillCompletedFunctionCall(ctx, item)
  }
  yield* emitCompletedTerminal(ctx, chunk)
}

function* handleErrorEvent(
  ctx: ResponsesStreamContext,
  chunk: ResponsesStreamChunk,
): Generator<AdapterYieldChunk> {
  if (chunk.type !== 'error') return
  // Conditional `code` spread keeps the wire shape spec-compliant
  // under `exactOptionalPropertyTypes` (see chatStream catch).
  const code = chunk.code ?? undefined
  yield {
    type: EventType.RUN_ERROR,
    model: emitModel(ctx),
    timestamp: Date.now(),
    message: chunk.message,
    ...(code !== undefined && { code }),
    error: {
      message: chunk.message,
      ...(code !== undefined && { code }),
    },
  }
  ctx.state.runFinishedEmitted = true
  ctx.state.stop = true
}

const STREAM_HANDLERS: Record<string, StreamHandler> = {
  'response.created': handleCreated,
  'response.failed': handleFailedOrIncomplete,
  'response.incomplete': handleFailedOrIncomplete,
  'response.output_text.delta': handleOutputTextDelta,
  'response.reasoning_text.delta': handleReasoningTextDelta,
  'response.reasoning.delta': handleReasoningTextDelta,
  'response.reasoning_summary_text.delta': handleReasoningSummaryDelta,
  'response.content_part.added': handleContentPartAdded,
  'response.content_part.done': handleContentPartDone,
  'response.output_item.added': handleOutputItemAdded,
  'response.function_call_arguments.delta': handleFunctionCallArgsDelta,
  'response.function_call_arguments.done': handleFunctionCallArgsDone,
  'response.output_item.done': handleOutputItemDone,
  'response.completed': handleCompleted,
  error: handleErrorEvent,
}

function* emitSyntheticFinish(
  ctx: ResponsesStreamContext,
): Generator<AdapterYieldChunk> {
  const shouldSkipSyntheticFinish =
    ctx.state.runFinishedEmitted || !ctx.aguiState.hasEmittedRunStarted
  if (shouldSkipSyntheticFinish) {
    return
  }
  yield* closeReasoning(ctx)
  if (ctx.state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: ctx.aguiState.messageId,
      model: emitModel(ctx),
      timestamp: Date.now(),
    }
  }
  yield {
    type: EventType.RUN_FINISHED,
    runId: ctx.aguiState.runId,
    threadId: ctx.aguiState.threadId,
    model: emitModel(ctx),
    timestamp: Date.now(),
    finishReason: ctx.toolCallMetadata.size > 0 ? 'tool_calls' : 'stop',
  }
}

function* emitFatalError(
  ctx: ResponsesStreamContext,
  error: unknown,
): Generator<AdapterYieldChunk> {
  const errorPayload = toRunErrorPayload(
    error,
    `${ctx.adapterName}.processStreamChunks failed`,
  )
  const rawEvent = toRunErrorRawEvent(error)
  ctx.options.logger.errors(`${ctx.adapterName}.processStreamChunks fatal`, {
    error: errorPayload,
    source: `${ctx.adapterName}.processStreamChunks`,
  })
  yield {
    type: EventType.RUN_ERROR,
    model: ctx.options.model,
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

export async function* processResponsesStream(
  args: ProcessResponsesStreamArgs,
): AsyncIterable<AdapterYieldChunk> {
  const ctx: ResponsesStreamContext = {
    adapterName: args.adapterName,
    options: args.options,
    aguiState: args.aguiState,
    toolCallMetadata: args.toolCallMetadata,
    normalizeToolInput: createToolInputNormalizer(
      args.options.tools,
      args.toCompatibility,
    ),
    state: {
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
    },
  }

  try {
    for await (const chunk of args.stream) {
      args.options.logger.provider(
        `provider=${args.adapterName} type=${chunk.type}`,
        {
          provider: args.adapterName,
          type: chunk.type,
        },
      )

      yield* emitRunStartedIfNeeded(ctx)

      const handler = STREAM_HANDLERS[chunk.type]
      if (!handler) continue
      const produced = handler(ctx, chunk)
      if (produced) yield* produced
      if (ctx.state.stop) return
    }

    yield* emitSyntheticFinish(ctx)
  } catch (error: unknown) {
    yield* emitFatalError(ctx, error)
  }
}
