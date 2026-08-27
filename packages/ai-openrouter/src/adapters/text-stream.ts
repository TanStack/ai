import { EventType } from '@tanstack/ai'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { buildOpenRouterUsage } from '../usage'
import { extractUsageCost } from './cost'
import type { ChatStreamChoice, ChatStreamChunk } from '@openrouter/sdk/models'
import type { AdapterYieldChunk } from '@tanstack/ai'

interface ChatStreamLog {
  provider: (message: string, extra?: unknown) => void
  errors: (message: string, extra?: unknown) => void
}

interface ChatLoopOptions {
  model: string
  parentRunId?: string
  logger: ChatStreamLog
}

interface ChatAguiState {
  runId: string
  threadId: string
  messageId: string
  hasEmittedRunStarted: boolean
}

interface ToolCallInProgress {
  id: string
  name: string
  arguments: string
  started: boolean
}

interface ChatStreamState {
  adapterName: string
  accumulatedContent: string
  hasEmittedTextMessageStart: boolean
  lastModel: string | undefined
  lastUsage: ChatStreamChunk['usage'] | undefined
  pendingFinishReason: ChatStreamChoice['finishReason'] | undefined
  toolCallsInProgress: Map<number, ToolCallInProgress>
  reasoningMessageId: string | undefined
  hasClosedReasoning: boolean
  stepId: string | undefined
  accumulatedReasoning: string
  emittedAnyToolCallEnd: boolean
}

export interface ChatStructuredStreamState {
  adapterName: string
  accumulatedContent: string
  accumulatedReasoning: string
  hasEmittedTextMessageStart: boolean
  reasoningMessageId: string | undefined
  hasClosedReasoning: boolean
  stepId: string | undefined
  lastModel: string | undefined
  lastUsage: ChatStreamChunk['usage'] | undefined
}

function currentModel(lastModel: string | undefined, fallback: string): string {
  return lastModel || fallback
}

function isAbortError(error: unknown): boolean {
  const isNotNamedError =
    typeof error !== 'object' || error === null || !('name' in error)
  if (isNotNamedError) {
    return false
  }
  const errName = (error as { name: unknown }).name
  return errName === 'AbortError' || errName === 'RequestAbortedError'
}

function parseToolCallInput(
  toolCall: ToolCallInProgress,
  options: ChatLoopOptions,
  adapterName: string,
  logSuffix: string,
): unknown {
  if (!toolCall.arguments) return {}
  try {
    const parsed: unknown = JSON.parse(toolCall.arguments)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (parseError) {
    options.logger.errors(
      `${adapterName}.processStreamChunks tool-args JSON parse failed${logSuffix}`,
      {
        error: toRunErrorPayload(
          parseError,
          `tool ${toolCall.name} (${toolCall.id}) returned malformed JSON arguments`,
        ),
        source: `${adapterName}.processStreamChunks`,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        rawArguments: toolCall.arguments,
      },
    )
    return {}
  }
}

function mapChatFinishReason(
  emittedAnyToolCallEnd: boolean,
  pendingFinishReason: ChatStreamChoice['finishReason'] | undefined,
): 'tool_calls' | 'length' | 'content_filter' | 'stop' {
  if (emittedAnyToolCallEnd) return 'tool_calls'
  if (pendingFinishReason === 'tool_calls') return 'stop'
  if (pendingFinishReason === 'length') return 'length'
  const isContentFilterOrError =
    pendingFinishReason === 'content_filter' || pendingFinishReason === 'error'
  if (isContentFilterOrError) {
    return 'content_filter'
  }
  return 'stop'
}

function* emitRunStartedIfNeeded(
  aguiState: ChatAguiState,
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

function* closeChatReasoning(
  state: {
    reasoningMessageId: string | undefined
    hasClosedReasoning: boolean
    stepId: string | undefined | null
    accumulatedReasoning: string
  },
  model: string,
  reset: boolean,
): Generator<AdapterYieldChunk> {
  const reasoningMessageId = state.reasoningMessageId
  const shouldSkipCloseReasoning =
    !reasoningMessageId || state.hasClosedReasoning
  if (shouldSkipCloseReasoning) return
  state.hasClosedReasoning = true
  yield {
    type: EventType.REASONING_MESSAGE_END,
    messageId: reasoningMessageId,
    model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.REASONING_END,
    messageId: reasoningMessageId,
    model,
    timestamp: Date.now(),
  }
  if (state.stepId) {
    yield {
      type: EventType.STEP_FINISHED,
      stepName: state.stepId,
      stepId: state.stepId,
      model,
      timestamp: Date.now(),
      content: state.accumulatedReasoning,
    }
  }
  if (reset) {
    state.reasoningMessageId = undefined
    state.stepId = undefined
    state.hasClosedReasoning = false
  }
}

function* openChatReasoning(
  state: {
    adapterName: string
    reasoningMessageId: string | undefined
    stepId: string | undefined
  },
  model: string,
): Generator<AdapterYieldChunk> {
  if (state.reasoningMessageId) return
  state.reasoningMessageId = generateId(state.adapterName)
  state.stepId = generateId(state.adapterName)
  yield {
    type: EventType.REASONING_START,
    messageId: state.reasoningMessageId,
    model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.REASONING_MESSAGE_START,
    messageId: state.reasoningMessageId,
    role: 'reasoning' as const,
    model,
    timestamp: Date.now(),
  }
  yield {
    type: EventType.STEP_STARTED,
    stepName: state.stepId,
    stepId: state.stepId,
    model,
    timestamp: Date.now(),
    stepType: 'thinking',
  }
}

function* emitChatReasoningDelta(
  state: ChatStreamState | ChatStructuredStreamState,
  reasoningText: string,
  model: string,
): Generator<AdapterYieldChunk> {
  if (!reasoningText) return
  yield* openChatReasoning(state, model)
  if (!state.reasoningMessageId) return
  state.accumulatedReasoning += reasoningText
  yield {
    type: EventType.REASONING_MESSAGE_CONTENT,
    messageId: state.reasoningMessageId,
    delta: reasoningText,
    model,
    timestamp: Date.now(),
  }
}

function* emitChatContentDelta(
  state: ChatStreamState | ChatStructuredStreamState,
  aguiState: ChatAguiState,
  deltaContent: string,
  model: string,
  resetReasoning: boolean,
): Generator<AdapterYieldChunk> {
  yield* closeChatReasoning(state, model, resetReasoning)
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: aguiState.messageId,
      model,
      timestamp: Date.now(),
      role: 'assistant',
    }
  }
  state.accumulatedContent += deltaContent
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: aguiState.messageId,
    model,
    timestamp: Date.now(),
    delta: deltaContent,
    content: state.accumulatedContent,
  }
}

function* emitChatToolCallDeltas(
  deltaToolCalls: ChatStreamChoice['delta']['toolCalls'],
  chunk: ChatStreamChunk,
  options: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStreamState,
): Generator<AdapterYieldChunk> {
  if (!deltaToolCalls) return
  const model = chunk.model || options.model
  for (const toolCallDelta of deltaToolCalls) {
    const index = toolCallDelta.index
    let toolCall = state.toolCallsInProgress.get(index)
    if (!toolCall) {
      toolCall = {
        id: toolCallDelta.id || '',
        name: toolCallDelta.function?.name || '',
        arguments: '',
        started: false,
      }
      state.toolCallsInProgress.set(index, toolCall)
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
        parentMessageId: aguiState.messageId,
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

function* endInProgressToolCalls(
  state: ChatStreamState,
  options: ChatLoopOptions,
  model: string,
  logSuffix: string,
): Generator<AdapterYieldChunk> {
  for (const [, toolCall] of state.toolCallsInProgress) {
    if (!toolCall.started) continue
    const parsedInput = parseToolCallInput(
      toolCall,
      options,
      state.adapterName,
      logSuffix,
    )
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: toolCall.id,
      toolCallName: toolCall.name,
      toolName: toolCall.name,
      model,
      timestamp: Date.now(),
      input: parsedInput,
    }
    state.emittedAnyToolCallEnd = true
  }
}

function* emitChatFinishReason(
  choice: ChatStreamChoice,
  chunk: ChatStreamChunk,
  options: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStreamState,
): Generator<AdapterYieldChunk> {
  const model = chunk.model || options.model
  const hasPendingToolCalls =
    choice.finishReason === 'tool_calls' || state.toolCallsInProgress.size > 0
  if (hasPendingToolCalls) {
    yield* endInProgressToolCalls(state, options, model, '')
    state.toolCallsInProgress.clear()
  }
  if (state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: aguiState.messageId,
      model,
      timestamp: Date.now(),
    }
    state.hasEmittedTextMessageStart = false
  }
  state.pendingFinishReason = choice.finishReason
}

function* consumeChatChunk(
  chunk: ChatStreamChunk,
  options: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStreamState,
): Generator<AdapterYieldChunk> {
  const choiceForLog = chunk.choices[0]
  options.logger.provider(
    `provider=${state.adapterName} finishReason=${choiceForLog?.finishReason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasToolCalls=${!!choiceForLog?.delta.toolCalls} hasUsage=${!!chunk.usage}`,
    { provider: state.adapterName, model: chunk.model },
  )

  if (chunk.error) {
    throw Object.assign(
      new Error(chunk.error.message || 'OpenRouter stream error'),
      { code: chunk.error.code, rawEvent: chunk.error },
    )
  }

  if (chunk.usage) {
    state.lastUsage = chunk.usage
  }
  if (chunk.model) {
    state.lastModel = chunk.model
  }

  yield* emitRunStartedIfNeeded(
    aguiState,
    chunk.model || options.model,
    options.parentRunId,
  )

  yield* emitChatReasoningDelta(
    state,
    extractReasoningText(chunk),
    chunk.model || options.model,
  )

  const choice = chunk.choices[0]
  if (!choice) return

  const deltaContent = choice.delta.content
  if (deltaContent) {
    yield* emitChatContentDelta(
      state,
      aguiState,
      deltaContent,
      chunk.model || options.model,
      false,
    )
  }

  yield* emitChatToolCallDeltas(
    choice.delta.toolCalls,
    chunk,
    options,
    aguiState,
    state,
  )

  if (choice.finishReason) {
    yield* emitChatFinishReason(choice, chunk, options, aguiState, state)
  }
}

function* drainAfterChatStream(
  options: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStreamState,
): Generator<AdapterYieldChunk> {
  if (!aguiState.hasEmittedRunStarted) return
  const model = currentModel(state.lastModel, options.model)
  yield* endInProgressToolCalls(state, options, model, ' (drain)')
  state.toolCallsInProgress.clear()
  if (state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: aguiState.messageId,
      model,
      timestamp: Date.now(),
    }
  }
  yield* closeChatReasoning(state, model, false)
  const finishReason = mapChatFinishReason(
    state.emittedAnyToolCallEnd,
    state.pendingFinishReason,
  )
  const finalUsage = buildOpenRouterUsage(state.lastUsage)
  yield {
    type: EventType.RUN_FINISHED,
    runId: aguiState.runId,
    threadId: aguiState.threadId,
    model,
    timestamp: Date.now(),
    ...(finalUsage && {
      usage: { ...finalUsage, ...extractUsageCost(state.lastUsage) },
    }),
    finishReason,
  }
}

function* emitChatStreamError(
  error: unknown,
  options: ChatLoopOptions,
  state: ChatStreamState,
): Generator<AdapterYieldChunk> {
  const errorPayload = toRunErrorPayload(
    error,
    `${state.adapterName}.processStreamChunks failed`,
  )
  const rawEvent = toRunErrorRawEvent(error)
  options.logger.errors(`${state.adapterName}.processStreamChunks fatal`, {
    error: errorPayload,
    source: `${state.adapterName}.processStreamChunks`,
  })
  yield {
    type: EventType.RUN_ERROR,
    model: options.model,
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

export async function* processChatStreamChunks(args: {
  stream: AsyncIterable<ChatStreamChunk>
  options: ChatLoopOptions
  aguiState: ChatAguiState
  adapterName: string
}): AsyncIterable<AdapterYieldChunk> {
  const state: ChatStreamState = {
    adapterName: args.adapterName,
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
  }
  try {
    for await (const chunk of args.stream) {
      yield* consumeChatChunk(chunk, args.options, args.aguiState, state)
    }
    yield* drainAfterChatStream(args.options, args.aguiState, state)
  } catch (error: unknown) {
    yield* emitChatStreamError(error, args.options, state)
  }
}

export function* consumeChatStructuredChunk(
  chunk: ChatStreamChunk,
  chatOptions: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStructuredStreamState,
): Generator<AdapterYieldChunk> {
  const choiceForLog = chunk.choices[0]
  chatOptions.logger.provider(
    `provider=${state.adapterName} finishReason=${choiceForLog?.finishReason ?? 'none'} hasContent=${!!choiceForLog?.delta.content} hasUsage=${!!chunk.usage}`,
    { provider: state.adapterName, model: chunk.model },
  )

  if (chunk.model) state.lastModel = chunk.model
  if (chunk.usage) state.lastUsage = chunk.usage

  yield* emitRunStartedIfNeeded(
    aguiState,
    chunk.model || chatOptions.model,
    chatOptions.parentRunId,
  )

  yield* emitChatReasoningDelta(
    state,
    extractReasoningText(chunk),
    chunk.model || chatOptions.model,
  )

  const choice = chunk.choices[0]
  if (!choice) return

  const deltaContent = choice.delta.content
  if (deltaContent) {
    yield* emitChatContentDelta(
      state,
      aguiState,
      deltaContent,
      chunk.model || chatOptions.model,
      true,
    )
  }
}

export function* finishChatStructuredStream(
  chatOptions: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStructuredStreamState,
  transform: (parsed: unknown) => unknown,
): Generator<AdapterYieldChunk> {
  const model = currentModel(state.lastModel, chatOptions.model)
  yield* closeChatReasoning(state, model, true)

  if (state.hasEmittedTextMessageStart) {
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: aguiState.messageId,
      model,
      timestamp: Date.now(),
    }
  }

  if (state.accumulatedContent.length === 0) {
    yield {
      type: EventType.RUN_ERROR,
      runId: aguiState.runId,
      model,
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
      model,
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
    model,
    timestamp: Date.now(),
  }

  const finalUsage = buildOpenRouterUsage(state.lastUsage)
  yield {
    type: EventType.RUN_FINISHED,
    runId: aguiState.runId,
    threadId: aguiState.threadId,
    model,
    timestamp: Date.now(),
    finishReason: 'stop',
    ...(finalUsage && {
      usage: { ...finalUsage, ...extractUsageCost(state.lastUsage) },
    }),
  }
}

export function* emitChatStructuredStreamError(
  error: unknown,
  chatOptions: ChatLoopOptions,
  aguiState: ChatAguiState,
  state: ChatStructuredStreamState,
): Generator<AdapterYieldChunk> {
  yield* emitRunStartedIfNeeded(
    aguiState,
    chatOptions.model,
    chatOptions.parentRunId,
  )

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
    model: currentModel(state.lastModel, chatOptions.model),
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

function extractReasoningText(chunk: ChatStreamChunk): string {
  let text = ''
  for (const choice of chunk.choices) {
    const details = (choice.delta as { reasoningDetails?: Array<unknown> })
      .reasoningDetails
    if (!Array.isArray(details)) continue
    for (const detail of details) {
      const d = detail as { type?: string; text?: unknown; summary?: unknown }
      if (d.type === 'reasoning.text' && typeof d.text === 'string') {
        text += d.text
      } else if (
        d.type === 'reasoning.summary' &&
        typeof d.summary === 'string'
      ) {
        text += d.summary
      }
    }
  }
  return text
}
