import { EventType } from '@tanstack/ai'
import { generateId } from '@tanstack/ai-utils'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { createToolInputNormalizer } from '../utils/tool-input-normalizer'
import { buildChatCompletionsUsage } from '../usage'
import type { StructuredOutputCompatibility } from '../utils/schema-converter'
import type { AdapterYieldChunk, TextOptions } from '@tanstack/ai'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions'

export type ChatStreamState = {
  runId: string
  threadId: string
  messageId: string
  hasEmittedRunStarted: boolean
}

type ToolCallInProgress = {
  id: string
  name: string
  arguments: string
  started: boolean
}

interface ChatStreamProcessState {
  accumulatedContent: string
  hasEmittedTextMessageStart: boolean
  lastModel: string | undefined
  lastUsage: ChatCompletionChunk['usage'] | undefined
  pendingFinishReason:
    | ChatCompletionChunk['choices'][number]['finish_reason']
    | undefined
  toolCallsInProgress: Map<number, ToolCallInProgress>
  reasoningMessageId: string | undefined
  hasClosedReasoning: boolean
  stepId: string | undefined
  accumulatedReasoning: string
  emittedAnyToolCallEnd: boolean
}

interface ChatStreamContext {
  adapterName: string
  options: TextOptions
  aguiState: ChatStreamState
  extractReasoning: (chunk: unknown) => { text: string } | undefined
  normalizeToolInput: (toolName: string, input: unknown) => unknown
  state: ChatStreamProcessState
}

function chunkModel(ctx: ChatStreamContext, chunkModelValue?: string): string {
  return chunkModelValue || ctx.options.model
}

function parseToolCallInput(
  ctx: ChatStreamContext,
  toolCall: ToolCallInProgress,
  logSuffix: string,
): unknown {
  let parsedInput: unknown = {}
  if (!toolCall.arguments) return parsedInput
  try {
    const parsed: unknown = JSON.parse(toolCall.arguments)
    parsedInput = ctx.normalizeToolInput(
      toolCall.name,
      parsed && typeof parsed === 'object' ? parsed : {},
    )
  } catch (parseError) {
    ctx.options.logger.errors(
      `${ctx.adapterName}.processStreamChunks tool-args JSON parse failed${logSuffix}`,
      {
        error: toRunErrorPayload(
          parseError,
          `tool ${toolCall.name} (${toolCall.id}) returned malformed JSON arguments`,
        ),
        source: `${ctx.adapterName}.processStreamChunks`,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        rawArguments: toolCall.arguments,
      },
    )
    parsedInput = {}
  }
  return parsedInput
}

function* closeReasoning(
  ctx: ChatStreamContext,
  model: string,
): Generator<AdapterYieldChunk> {
  if (!ctx.state.reasoningMessageId || ctx.state.hasClosedReasoning) return
  ctx.state.hasClosedReasoning = true
  yield {
    type: EventType.REASONING_MESSAGE_END,
    messageId: ctx.state.reasoningMessageId,
    model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.REASONING_END,
    messageId: ctx.state.reasoningMessageId,
    model,
    timestamp: Date.now(),
  }
  if (ctx.state.stepId) {
    yield {
      type: EventType.STEP_FINISHED,
      stepName: ctx.state.stepId,
      stepId: ctx.state.stepId,
      model,
      timestamp: Date.now(),
      content: ctx.state.accumulatedReasoning,
    }
  }
}

function* emitReasoning(
  ctx: ChatStreamContext,
  chunk: ChatCompletionChunk,
): Generator<AdapterYieldChunk> {
  const reasoning = ctx.extractReasoning(chunk)
  if (!reasoning || !reasoning.text) return
  const model = chunkModel(ctx, chunk.model)
  if (!ctx.state.reasoningMessageId) {
    ctx.state.reasoningMessageId = generateId(ctx.adapterName)
    ctx.state.stepId = generateId(ctx.adapterName)
    yield {
      type: EventType.REASONING_START,
      messageId: ctx.state.reasoningMessageId,
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.REASONING_MESSAGE_START,
      messageId: ctx.state.reasoningMessageId,
      role: 'reasoning' as const,
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.STEP_STARTED,
      stepName: ctx.state.stepId,
      stepId: ctx.state.stepId,
      model,
      timestamp: Date.now(),
      stepType: 'thinking',
    }
  }
  ctx.state.accumulatedReasoning += reasoning.text
  yield {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: ctx.state.reasoningMessageId,
    delta: reasoning.text,
    model,
    timestamp: Date.now(),
  }
}

function* emitContentDelta(
  ctx: ChatStreamContext,
  chunk: ChatCompletionChunk,
  deltaContent: string,
): Generator<AdapterYieldChunk> {
  const model = chunkModel(ctx, chunk.model)
  yield* closeReasoning(ctx, model)
  if (!ctx.state.hasEmittedTextMessageStart) {
    ctx.state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: ctx.aguiState.messageId,
      model,
      timestamp: Date.now(),
      role: 'assistant',
    }
  }
  ctx.state.accumulatedContent += deltaContent
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: ctx.aguiState.messageId,
    model,
    timestamp: Date.now(),
    delta: deltaContent,
    content: ctx.state.accumulatedContent,
  }
}

function* emitToolCallDeltas(
  ctx: ChatStreamContext,
  chunk: ChatCompletionChunk,
  deltaToolCalls: NonNullable<
    ChatCompletionChunk['choices'][number]['delta']['tool_calls']
  >,
): Generator<AdapterYieldChunk> {
  const model = chunkModel(ctx, chunk.model)
  for (const toolCallDelta of deltaToolCalls) {
    const index = toolCallDelta.index
    let toolCall = ctx.state.toolCallsInProgress.get(index)
    if (!toolCall) {
      toolCall = {
        id: toolCallDelta.id || '',
        name: toolCallDelta.function?.name || '',
        arguments: '',
        started: false,
      }
      ctx.state.toolCallsInProgress.set(index, toolCall)
    }

    if (toolCallDelta.id) {
      toolCall.id = toolCallDelta.id
    }
    if (toolCallDelta.function?.name) {
      toolCall.name = toolCallDelta.function.name
    }
    if (toolCallDelta.function?.arguments) {
      toolCall.arguments += toolCallDelta.function.arguments
    }

    if (toolCall.id && toolCall.name && !toolCall.started) {
      toolCall.started = true
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: toolCall.id,
        toolCallName: toolCall.name,
        toolName: toolCall.name,
        parentMessageId: ctx.aguiState.messageId,
        model,
        timestamp: Date.now(),
        index,
      }
    }

    if (toolCallDelta.function?.arguments && toolCall.started) {
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: toolCall.id,
        model,
        timestamp: Date.now(),
        delta: toolCallDelta.function.arguments,
      }
    }
  }
}

function* emitStartedToolCallEnds(
  ctx: ChatStreamContext,
  model: string,
  logSuffix: string,
): Generator<AdapterYieldChunk> {
  for (const [, toolCall] of ctx.state.toolCallsInProgress) {
    if (!toolCall.started) continue
    const parsedInput = parseToolCallInput(ctx, toolCall, logSuffix)
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      toolName: toolCall.name,
      model,
      timestamp: Date.now(),
      input: parsedInput,
    }
    ctx.state.emittedAnyToolCallEnd = true
  }
  ctx.state.toolCallsInProgress.clear()
}

function* handleFinishReason(
  ctx: ChatStreamContext,
  chunk: ChatCompletionChunk,
  finishReason: NonNullable<
    ChatCompletionChunk['choices'][number]['finish_reason']
  >,
): Generator<AdapterYieldChunk> {
  const model = chunkModel(ctx, chunk.model)
  if (finishReason === 'tool_calls' || ctx.state.toolCallsInProgress.size > 0) {
    yield* emitStartedToolCallEnds(ctx, model, '')
  }

  if (ctx.state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: ctx.aguiState.messageId,
      model,
      timestamp: Date.now(),
    }
    ctx.state.hasEmittedTextMessageStart = false
  }

  ctx.state.pendingFinishReason = finishReason
}

function mapFinishReason(
  emittedAnyToolCallEnd: boolean,
  pendingFinishReason:
    | ChatCompletionChunk['choices'][number]['finish_reason']
    | undefined,
): NonNullable<AdapterYieldChunk['finishReason']> {
  if (emittedAnyToolCallEnd) return 'tool_calls'
  if (pendingFinishReason === 'tool_calls') return 'stop'
  if (pendingFinishReason === 'function_call') return 'tool_calls'
  return pendingFinishReason ?? 'stop'
}

function* drainEndOfStream(
  ctx: ChatStreamContext,
): Generator<AdapterYieldChunk> {
  const model = ctx.state.lastModel || ctx.options.model
  yield* emitStartedToolCallEnds(ctx, model, ' (drain)')

  if (ctx.state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: ctx.aguiState.messageId,
      model,
      timestamp: Date.now(),
    }
  }

  yield* closeReasoning(ctx, model)

  yield {
    type: EventType.RUN_FINISHED,
    runId: ctx.aguiState.runId,
    threadId: ctx.aguiState.threadId,
    model,
    timestamp: Date.now(),
    ...(ctx.state.lastUsage && {
      usage: buildChatCompletionsUsage(ctx.state.lastUsage),
    }),
    finishReason: mapFinishReason(
      ctx.state.emittedAnyToolCallEnd,
      ctx.state.pendingFinishReason,
    ),
  }
}

function* emitRunStartedIfNeeded(
  ctx: ChatStreamContext,
  chunk: ChatCompletionChunk,
): Generator<AdapterYieldChunk> {
  if (ctx.aguiState.hasEmittedRunStarted) return
  ctx.aguiState.hasEmittedRunStarted = true
  yield {
    type: EventType.RUN_STARTED,
    runId: ctx.aguiState.runId,
    threadId: ctx.aguiState.threadId,
    model: chunkModel(ctx, chunk.model),
    timestamp: Date.now(),
    parentRunId: ctx.options.parentRunId,
  }
}

function* handleChatChunk(
  ctx: ChatStreamContext,
  chunk: ChatCompletionChunk,
): Generator<AdapterYieldChunk> {
  const choiceForLog = chunk.choices[0]
  ctx.options.logger.provider(
    `provider=${ctx.adapterName} finish_reason=${choiceForLog?.finish_reason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasToolCalls=${!!choiceForLog?.delta.tool_calls} hasUsage=${!!chunk.usage}`,
    { provider: ctx.adapterName, model: chunk.model },
  )

  if (chunk.usage) {
    ctx.state.lastUsage = chunk.usage
  }
  if (chunk.model) {
    ctx.state.lastModel = chunk.model
  }

  yield* emitRunStartedIfNeeded(ctx, chunk)
  yield* emitReasoning(ctx, chunk)

  const choice = chunk.choices[0]
  if (!choice) return

  const delta = choice.delta
  if (delta.content) {
    yield* emitContentDelta(ctx, chunk, delta.content)
  }
  if (delta.tool_calls) {
    yield* emitToolCallDeltas(ctx, chunk, delta.tool_calls)
  }
  if (choice.finish_reason) {
    yield* handleFinishReason(ctx, chunk, choice.finish_reason)
  }
}

interface ProcessChatCompletionsStreamArgs {
  stream: AsyncIterable<ChatCompletionChunk>
  options: TextOptions
  aguiState: ChatStreamState
  adapterName: string
  extractReasoning: (chunk: unknown) => { text: string } | undefined
  toCompatibility: (
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ) => StructuredOutputCompatibility
  handleError: (error: unknown) => AsyncIterable<AdapterYieldChunk>
}

export async function* processChatCompletionsStream(
  args: ProcessChatCompletionsStreamArgs,
): AsyncIterable<AdapterYieldChunk> {
  const ctx: ChatStreamContext = {
    adapterName: args.adapterName,
    options: args.options,
    aguiState: args.aguiState,
    extractReasoning: args.extractReasoning,
    normalizeToolInput: createToolInputNormalizer(
      args.options.tools,
      args.toCompatibility,
    ),
    state: {
      accumulatedContent: '',
      hasEmittedTextMessageStart: false,
      lastModel: undefined,
      lastUsage: undefined,
      pendingFinishReason: undefined,
      toolCallsInProgress: new Map(),
      reasoningMessageId: undefined,
      hasClosedReasoning: false,
      stepId: undefined,
      accumulatedReasoning: '',
      emittedAnyToolCallEnd: false,
    },
  }

  try {
    for await (const chunk of args.stream) {
      yield* handleChatChunk(ctx, chunk)
    }

    if (ctx.aguiState.hasEmittedRunStarted) {
      yield* drainEndOfStream(ctx)
    }
  } catch (error: unknown) {
    yield* args.handleError(error)
  }
}
