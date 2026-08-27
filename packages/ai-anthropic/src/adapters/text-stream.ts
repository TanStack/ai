import { EventType } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { getAnthropicDefaultMaxTokens } from '../model-meta'
import { buildAnthropicUsage } from '../usage'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk, TextOptions } from '@tanstack/ai'
import type Anthropic_SDK from '@anthropic-ai/sdk'

type AnthropicStreamEvent = Anthropic_SDK.Beta.BetaRawMessageStreamEvent

interface ToolCallBuffer {
  id: string
  name: string
  input: string
  started: boolean
}

interface ServerToolBuffer {
  id: string
  name: string
  input: string
}

interface AnthropicStreamState {
  options: TextOptions
  genId: () => string
  logger: InternalLogger
  model: string
  runId: string
  threadId: string
  messageId: string
  accumulatedContent: string
  accumulatedThinking: string
  accumulatedSignature: string
  toolCallsMap: Map<number, ToolCallBuffer>
  currentToolIndex: number
  currentServerTool: ServerToolBuffer | null
  completedServerTools: Map<string, ServerToolBuffer>
  stepId: string | null
  reasoningMessageId: string | null
  hasClosedReasoning: boolean
  hasEmittedRunStarted: boolean
  hasEmittedTextMessageStart: boolean
  hasEmittedRunFinished: boolean
  currentBlockType: string | null
}

type AnthropicStreamHandler = (
  event: AnthropicStreamEvent,
  state: AnthropicStreamState,
) => Generator<AdapterYieldChunk>

function parseJsonObject(input: string): unknown {
  try {
    const parsed = input ? JSON.parse(input) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function* closeReasoning(
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (state.reasoningMessageId && !state.hasClosedReasoning) {
    state.hasClosedReasoning = true
    yield {
      type: EventType.REASONING_MESSAGE_END,
      messageId: state.reasoningMessageId,
      model: state.model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.REASONING_END,
      messageId: state.reasoningMessageId,
      model: state.model,
      timestamp: Date.now(),
    }
  }
}

function* handleServerToolResult(
  event: Extract<AnthropicStreamEvent, { type: 'content_block_start' }>,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  const block = event.content_block
  if (
    block.type !== 'web_fetch_tool_result' &&
    block.type !== 'web_search_tool_result'
  ) {
    return
  }

  // The result content arrives in full at content_block_start (no
  // deltas). Surface error variants so a failed fetch/search isn't
  // invisible to the consumer.
  const content = block.content as
    | { type?: string; error_code?: string }
    | Array<unknown>
  const errorBlock =
    !Array.isArray(content) &&
    (content.type === 'web_fetch_tool_result_error' ||
      content.type === 'web_search_tool_result_error')
      ? content
      : null
  if (errorBlock) {
    state.logger.errors(
      `anthropic.${block.type} error_code=${errorBlock.error_code}`,
      {
        toolUseId: block.tool_use_id,
        blockType: block.type,
        errorCode: errorBlock.error_code,
        source: 'anthropic.processAnthropicStream',
      },
    )
  }

  // Emit the server tool as a single provider-executed tool call,
  // carrying its raw result so the evidence (e.g. web_search sources)
  // round-trips into the next turn's request. The agent loop skips
  // provider-executed calls, so this never triggers client execution.
  const serverTool = state.completedServerTools.get(block.tool_use_id)
  if (!serverTool) return

  state.completedServerTools.delete(serverTool.id)

  const parsedInput = parseJsonObject(serverTool.input)

  const serverToolMetadata = {
    providerExecuted: true,
    anthropic: {
      serverToolType: serverTool.name,
      resultBlockType: block.type,
      result: content,
    },
  }

  state.currentToolIndex++
  yield {
    type: EventType.TOOL_CALL_START,
    toolCallId: serverTool.id,
    toolCallName: serverTool.name,
    toolName: serverTool.name,
    parentMessageId: state.messageId,
    model: state.model,
    timestamp: Date.now(),
    index: state.currentToolIndex,
    metadata: serverToolMetadata,
  }
  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId: serverTool.id,
    toolCallName: serverTool.name,
    toolName: serverTool.name,
    model: state.model,
    timestamp: Date.now(),
    input: parsedInput,
  }

  // Text after the server tool starts a fresh message segment.
  state.hasEmittedTextMessageStart = false
}

function* handleContentBlockStart(
  event: AnthropicStreamEvent,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.type !== 'content_block_start') return

  state.currentBlockType = event.content_block.type
  if (event.content_block.type === 'tool_use') {
    state.currentToolIndex++
    state.toolCallsMap.set(state.currentToolIndex, {
      id: event.content_block.id,
      name: event.content_block.name,
      input: '',
      started: false,
    })
    return
  }
  if (event.content_block.type === 'server_tool_use') {
    state.currentServerTool = {
      id: event.content_block.id,
      name: event.content_block.name,
      input: '',
    }
    return
  }
  if (
    event.content_block.type === 'web_fetch_tool_result' ||
    event.content_block.type === 'web_search_tool_result'
  ) {
    yield* handleServerToolResult(event, state)
    return
  }
  if (event.content_block.type !== 'thinking') return

  state.accumulatedThinking = ''
  state.accumulatedSignature = ''
  // Emit REASONING and STEP_STARTED for thinking
  state.stepId = state.genId()
  state.reasoningMessageId = state.genId()

  // Spec REASONING events
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

  // Legacy STEP events (kept during transition)
  yield {
    type: EventType.STEP_STARTED,
    stepName: state.stepId,
    stepId: state.stepId,
    model: state.model,
    timestamp: Date.now(),
    stepType: 'thinking',
  }
}

function* handleTextDelta(
  event: Extract<AnthropicStreamEvent, { type: 'content_block_delta' }>,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.delta.type !== 'text_delta') return

  // Close reasoning before text starts
  yield* closeReasoning(state)

  // Emit TEXT_MESSAGE_START on first text content
  if (!state.hasEmittedTextMessageStart) {
    state.hasEmittedTextMessageStart = true
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: state.messageId,
      model: state.model,
      timestamp: Date.now(),
      role: 'assistant',
    }
  }

  const delta = event.delta.text
  state.accumulatedContent += delta
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: state.messageId,
    model: state.model,
    timestamp: Date.now(),
    delta,
    content: state.accumulatedContent,
  }
}

function* handleInputJsonDelta(
  event: Extract<AnthropicStreamEvent, { type: 'content_block_delta' }>,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.delta.type !== 'input_json_delta') return

  // Route deltas by current block type so server_tool_use input
  // never appends onto the prior client tool's buffer.
  if (state.currentBlockType === 'tool_use') {
    const existing = state.toolCallsMap.get(state.currentToolIndex)
    if (!existing) return

    // Emit TOOL_CALL_START on first args delta
    if (!existing.started) {
      existing.started = true
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: existing.id,
        toolCallName: existing.name,
        toolName: existing.name,
        parentMessageId: state.messageId,
        model: state.model,
        timestamp: Date.now(),
        index: state.currentToolIndex,
      }
    }

    existing.input += event.delta.partial_json

    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: existing.id,
      model: state.model,
      timestamp: Date.now(),
      delta: event.delta.partial_json,
      args: existing.input,
    }
    return
  }

  if (state.currentBlockType === 'server_tool_use' && state.currentServerTool) {
    // Accumulate server tool input internally. We don't emit
    // TOOL_CALL_* events: the call is executed by Anthropic, not
    // by our agent loop, so surfacing it as a client tool call
    // would cause downstream code to try (and fail) to run it.
    state.currentServerTool.input += event.delta.partial_json
  }
}

function* handleContentBlockDelta(
  event: AnthropicStreamEvent,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.type !== 'content_block_delta') return

  if (event.delta.type === 'text_delta') {
    yield* handleTextDelta(event, state)
    return
  }
  if (event.delta.type === 'thinking_delta' && state.reasoningMessageId) {
    const delta = event.delta.thinking
    state.accumulatedThinking += delta

    // Spec REASONING content event
    yield {
      type: EventType.REASONING_MESSAGE_CONTENT,
      messageId: state.reasoningMessageId,
      delta,
      model: state.model,
      timestamp: Date.now(),
    }

    // Legacy STEP event
    yield {
      type: EventType.STEP_FINISHED,
      stepName: state.stepId || state.genId(),
      stepId: state.stepId || state.genId(),
      model: state.model,
      timestamp: Date.now(),
      delta,
      content: state.accumulatedThinking,
    }
    return
  }
  if ((event.delta as { type: string }).type === 'signature_delta') {
    state.accumulatedSignature +=
      (event.delta as { signature: string }).signature || ''
    return
  }
  if (event.delta.type === 'input_json_delta') {
    yield* handleInputJsonDelta(event, state)
  }
}

function* handleToolUseStop(
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  const existing = state.toolCallsMap.get(state.currentToolIndex)
  if (!existing) return

  // If tool call wasn't started yet (no args), start it now
  if (!existing.started) {
    existing.started = true
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: existing.id,
      toolCallName: existing.name,
      toolName: existing.name,
      parentMessageId: state.messageId,
      model: state.model,
      timestamp: Date.now(),
      index: state.currentToolIndex,
    }
  }

  // Emit TOOL_CALL_END
  const parsedInput = parseJsonObject(existing.input)

  yield {
    type: EventType.TOOL_CALL_END,
    toolCallId: existing.id,
    toolCallName: existing.name,
    toolName: existing.name,
    model: state.model,
    timestamp: Date.now(),
    input: parsedInput,
  }

  // Reset so a new TEXT_MESSAGE_START is emitted if text follows tool calls
  state.hasEmittedTextMessageStart = false
}

function* handleContentBlockStop(
  event: AnthropicStreamEvent,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.type !== 'content_block_stop') return

  if (state.currentBlockType === 'thinking') {
    // Emit signature so it can be replayed in multi-turn context
    if (state.accumulatedSignature && state.stepId) {
      yield {
        type: EventType.STEP_FINISHED,
        stepName: state.stepId,
        stepId: state.stepId,
        model: state.model,
        timestamp: Date.now(),
        delta: '',
        content: state.accumulatedThinking,
        signature: state.accumulatedSignature,
      }
    }
  } else if (state.currentBlockType === 'tool_use') {
    yield* handleToolUseStop(state)
  } else if (state.currentBlockType === 'server_tool_use') {
    if (state.currentServerTool) {
      // Anthropic executes the call; we only need a breadcrumb so
      // consumers (devtools, telemetry) can see what ran.
      state.logger.provider(
        `provider=anthropic server_tool_use name=${state.currentServerTool.name}`,
        {
          toolUseId: state.currentServerTool.id,
          name: state.currentServerTool.name,
          input: state.currentServerTool.input,
        },
      )
      // Hold the call until its result block arrives so we can emit
      // both together as one provider-executed tool call.
      state.completedServerTools.set(
        state.currentServerTool.id,
        state.currentServerTool,
      )
    }
    state.currentServerTool = null
  } else if (
    state.currentBlockType === 'web_fetch_tool_result' ||
    state.currentBlockType === 'web_search_tool_result'
  ) {
    // The model already consumed the result; error variants were
    // already surfaced at content_block_start.
  } else if (state.hasEmittedTextMessageStart && state.accumulatedContent) {
    // Emit TEXT_MESSAGE_END only for text blocks (not tool_use blocks)
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: state.messageId,
      model: state.model,
      timestamp: Date.now(),
    }
  }
  state.currentBlockType = null
}

function* handleMessageStop(
  event: AnthropicStreamEvent,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.type !== 'message_stop') return

  // Close reasoning events if still open
  yield* closeReasoning(state)

  // Only emit RUN_FINISHED from message_stop if message_delta didn't already emit one.
  // message_delta carries the real stop_reason (tool_use, end_turn, etc.),
  // while message_stop is just a completion signal.
  if (!state.hasEmittedRunFinished) {
    yield {
      type: EventType.RUN_FINISHED,
      runId: state.runId,
      threadId: state.threadId,
      model: state.model,
      timestamp: Date.now(),
      finishReason: 'stop',
    }
  }
}

function* handleMaxTokensStop(
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  // Surface a warning when the truncating cap was the
  // adapter-supplied default (caller didn't pass `max_tokens`), so
  // the truncation isn't silently attributed to the model "doing
  // nothing" (issue #849). When the caller set `max_tokens`
  // themselves, hitting it is their own deliberate ceiling.
  if (state.options.modelOptions?.max_tokens == null) {
    const defaultedMaxTokens = getAnthropicDefaultMaxTokens(state.model)
    state.logger.warn(
      `anthropic response truncated at the default max_tokens (${defaultedMaxTokens}) for model=${state.model}; pass maxTokens (or modelOptions.max_tokens) to raise the output ceiling`,
      {
        source: 'anthropic.processAnthropicStream',
        model: state.model,
        defaultedMaxTokens,
      },
    )
  }
  yield {
    type: EventType.RUN_ERROR,
    model: state.model,
    timestamp: Date.now(),
    message:
      'The response was cut off because the maximum token limit was reached.',
    code: 'max_tokens',
    error: {
      message:
        'The response was cut off because the maximum token limit was reached.',
      code: 'max_tokens',
    },
  }
}

function* handleMessageDelta(
  event: AnthropicStreamEvent,
  state: AnthropicStreamState,
): Generator<AdapterYieldChunk> {
  if (event.type !== 'message_delta') return
  if (!event.delta.stop_reason) return

  state.hasEmittedRunFinished = true

  // Close reasoning events if still open
  yield* closeReasoning(state)

  switch (event.delta.stop_reason) {
    case 'tool_use': {
      yield {
        type: EventType.RUN_FINISHED,
        runId: state.runId,
        threadId: state.threadId,
        model: state.model,
        timestamp: Date.now(),
        finishReason: 'tool_calls',
        usage: buildAnthropicUsage(event.usage),
      }
      break
    }
    case 'max_tokens': {
      yield* handleMaxTokensStop(state)
      break
    }
    case 'stop_sequence':
    case 'end_turn':
    case 'pause_turn':
    case 'refusal':
    case 'model_context_window_exceeded':
    case 'compaction':
    default: {
      // All remaining Anthropic stop_reason variants map to the
      // generic "stop" finish reason — they describe *why* the
      // stream ended, but for AG-UI consumers the resulting event
      // shape is identical.
      yield {
        type: EventType.RUN_FINISHED,
        runId: state.runId,
        threadId: state.threadId,
        model: state.model,
        timestamp: Date.now(),
        finishReason: 'stop',
        usage: buildAnthropicUsage(event.usage),
      }
    }
  }
}

const anthropicStreamHandlers: Record<string, AnthropicStreamHandler> = {
  content_block_start: handleContentBlockStart,
  content_block_delta: handleContentBlockDelta,
  content_block_stop: handleContentBlockStop,
  message_stop: handleMessageStop,
  message_delta: handleMessageDelta,
}

export async function* processAnthropicStream(
  stream: AsyncIterable<AnthropicStreamEvent>,
  options: TextOptions,
  genId: () => string,
  logger: InternalLogger,
): AsyncIterable<AdapterYieldChunk> {
  const state: AnthropicStreamState = {
    options,
    genId,
    logger,
    model: options.model,
    runId: options.runId ?? genId(),
    threadId: options.threadId ?? genId(),
    messageId: genId(),
    accumulatedContent: '',
    accumulatedThinking: '',
    accumulatedSignature: '',
    toolCallsMap: new Map(),
    currentToolIndex: -1,
    currentServerTool: null,
    completedServerTools: new Map(),
    stepId: null,
    reasoningMessageId: null,
    hasClosedReasoning: false,
    hasEmittedRunStarted: false,
    hasEmittedTextMessageStart: false,
    hasEmittedRunFinished: false,
    currentBlockType: null,
  }

  try {
    for await (const event of stream) {
      logger.provider(`provider=anthropic type=${event.type}`, {
        chunk: event,
      })
      // Emit RUN_STARTED on first event
      if (!state.hasEmittedRunStarted) {
        state.hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId: state.runId,
          threadId: state.threadId,
          model: state.model,
          timestamp: Date.now(),
          parentRunId: options.parentRunId,
        }
      }

      const handler = anthropicStreamHandlers[event.type]
      if (handler) {
        yield* handler(event, state)
      }
    }
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string }
    const rawEvent = toRunErrorRawEvent(error)

    logger.errors('anthropic.processAnthropicStream fatal', {
      error,
      source: 'anthropic.processAnthropicStream',
    })
    yield {
      type: EventType.RUN_ERROR,
      model: state.model,
      timestamp: Date.now(),
      message: err.message || 'Unknown error occurred',
      code: err.code || String(err.status),
      // Forward the Anthropic SDK error's `.error` response body when present.
      ...(rawEvent !== undefined && { rawEvent }),
      error: {
        message: err.message || 'Unknown error occurred',
        code: err.code || String(err.status),
      },
    }
  }
}
