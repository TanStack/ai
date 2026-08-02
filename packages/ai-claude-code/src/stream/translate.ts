import { EventType, buildBaseUsage } from '@tanstack/ai'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'
import type {
  AgentSdkMessage,
  SdkAssistantMessage,
  SdkPartialAssistantMessage,
  SdkResultMessage,
  SdkToolResultContent,
  SdkUsage,
  SdkUserMessage,
} from './sdk-types'

/** Name of the CUSTOM event carrying the Claude Code session id. */
export const SESSION_ID_EVENT = 'claude-code.session-id'

/** Server name used for bridged TanStack tools (model sees `mcp__tanstack__<name>`). */
export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

const BRIDGED_MCP_PREFIX = `mcp__${BRIDGED_MCP_SERVER_NAME}__`

/** Claude Code-specific usage details attached to RUN_FINISHED usage. */
export type ClaudeCodeProviderUsageDetails = {
  /** Total cost of the harness run in USD, as reported by Claude Code. */
  totalCostUsd?: number
}

export interface TranslateContext {
  model: string
  runId: string
  threadId: string
  parentRunId?: string
  genId: () => string
  /** Called as soon as the harness reports its session id. */
  onSessionId?: (sessionId: string) => void
  /** Called for each raw SDK message, for logging. */
  onSdkMessage?: (message: AgentSdkMessage) => void
}

/**
 * Strip the bridged MCP server prefix so tool-call events match the TanStack
 * tool names the application registered. Built-in harness tools (Bash, Read,
 * Edit, ...) and foreign MCP tools pass through verbatim.
 */
export function stripMcpPrefix(name: string): string {
  return name.startsWith(BRIDGED_MCP_PREFIX)
    ? name.slice(BRIDGED_MCP_PREFIX.length)
    : name
}

function stringifyToolResultContent(
  content: SdkToolResultContent | undefined,
): string {
  if (content === undefined) return ''
  if (typeof content === 'string') return content
  return content
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
}

function buildUsage(
  usage: SdkUsage | undefined,
  totalCostUsd: number | undefined,
): TokenUsage<ClaudeCodeProviderUsageDetails> | undefined {
  if (!usage) return undefined
  const promptTokens = usage.input_tokens ?? 0
  const completionTokens = usage.output_tokens ?? 0
  const result = buildBaseUsage<ClaudeCodeProviderUsageDetails>({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  })
  const cacheWrite = usage.cache_creation_input_tokens
  const cacheRead = usage.cache_read_input_tokens
  const promptTokensDetails = {
    ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}),
    ...(cacheRead ? { cachedTokens: cacheRead } : {}),
  }
  if (Object.keys(promptTokensDetails).length > 0) {
    result.promptTokensDetails = promptTokensDetails
  }
  if (totalCostUsd !== undefined) {
    result.providerUsageDetails = { totalCostUsd }
  }
  return result
}

/**
 * Translate a Claude Code Agent SDK message stream into AG-UI StreamChunk
 * events.
 *
 * The harness runs its own agent loop and executes its own tools, so the
 * translation always ends with `finishReason: 'stop'` (or `'length'` /
 * RUN_ERROR) — never `'tool_calls'`. Harness tool activity is emitted as
 * already-resolved TOOL_CALL_START/ARGS/END + TOOL_CALL_RESULT sequences so
 * UIs can render it, while the TanStack engine never tries to execute them.
 *
 * Invariant: every TOOL_CALL_START is eventually paired with a
 * TOOL_CALL_RESULT (synthesized as `{"status":"interrupted"}` when the run
 * ends or aborts before the harness reported one) so the engine's
 * pending-tool-call scan on the next request never force-executes them.
 */
export async function* translateSdkStream(
  sdkMessages: AsyncIterable<AgentSdkMessage>,
  ctx: TranslateContext,
): AsyncIterable<StreamChunk> {
  const { model, runId, threadId, genId } = ctx
  const now = () => Date.now()

  let runStarted = false
  /** Tool calls started but with no result yet. */
  const unresolvedToolCalls = new Set<string>()
  /** Anthropic message ids whose text/thinking already streamed via partials. */
  const streamedMessageIds = new Set<string>()

  // Partial-stream state
  let partialMessageId: string | null = null
  let partialBlockType: string | null = null
  let partialTextMessageId: string | null = null
  let partialTextContent = ''
  let partialTextStarted = false
  let partialReasoningId: string | null = null

  function* startRun(): Generator<StreamChunk> {
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

  function* synthesizeUnresolvedResults(): Generator<StreamChunk> {
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

  function* closePartialText(): Generator<StreamChunk> {
    if (partialTextStarted && partialTextMessageId) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: partialTextMessageId,
        model,
        timestamp: now(),
      }
    }
    partialTextStarted = false
    partialTextMessageId = null
    partialTextContent = ''
  }

  function* closePartialReasoning(): Generator<StreamChunk> {
    if (partialReasoningId) {
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: partialReasoningId,
        model,
        timestamp: now(),
      }
      yield {
        type: EventType.REASONING_END,
        messageId: partialReasoningId,
        model,
        timestamp: now(),
      }
    }
    partialReasoningId = null
  }

  function* emitToolUse(block: {
    id: string
    name: string
    input: unknown
  }): Generator<StreamChunk> {
    const toolCallName = stripMcpPrefix(block.name)
    const args = JSON.stringify(block.input ?? {})
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: block.id,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
    }
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: block.id,
      model,
      timestamp: now(),
      delta: args,
      args,
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: block.id,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
      input: block.input ?? {},
    }
    unresolvedToolCalls.add(block.id)
  }

  function* handleAssistant(
    message: SdkAssistantMessage,
  ): Generator<StreamChunk> {
    const alreadyStreamed =
      message.message.id !== undefined &&
      streamedMessageIds.has(message.message.id)

    for (const block of message.message.content) {
      if (block.type === 'text') {
        if (alreadyStreamed) continue
        const messageId = message.message.id ?? genId()
        const text = (block as { text: string }).text
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          model,
          timestamp: now(),
          role: 'assistant',
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          model,
          timestamp: now(),
          delta: text,
          content: text,
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId,
          model,
          timestamp: now(),
        }
      } else if (block.type === 'thinking') {
        if (alreadyStreamed) continue
        const reasoningId = genId()
        const thinking = (block as { thinking: string }).thinking
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
        yield {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: reasoningId,
          delta: thinking,
          model,
          timestamp: now(),
        }
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
      } else if (block.type === 'tool_use') {
        yield* emitToolUse(
          block as { id: string; name: string; input: unknown },
        )
      }
    }
  }

  function* handleUser(message: SdkUserMessage): Generator<StreamChunk> {
    const content = message.message.content
    if (typeof content === 'string') return
    for (const block of content) {
      if (block.type !== 'tool_result') continue
      const toolResult = block as {
        tool_use_id: string
        content?: SdkToolResultContent
        is_error?: boolean
      }
      unresolvedToolCalls.delete(toolResult.tool_use_id)
      yield {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: toolResult.tool_use_id,
        messageId: genId(),
        model,
        timestamp: now(),
        content: stringifyToolResultContent(toolResult.content),
        ...(toolResult.is_error === true && { state: 'output-error' as const }),
      }
    }
  }

  function* handleResult(message: SdkResultMessage): Generator<StreamChunk> {
    yield* closePartialText()
    yield* closePartialReasoning()
    yield* synthesizeUnresolvedResults()

    const usage = buildUsage(message.usage, message.total_cost_usd)
    if (message.subtype === 'success') {
      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        timestamp: now(),
        finishReason: 'stop',
        ...(usage !== undefined && { usage }),
      }
    } else if (message.subtype === 'error_max_turns') {
      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        timestamp: now(),
        finishReason: 'length',
        ...(usage !== undefined && { usage }),
      }
    } else {
      const errorMessage =
        message.errors && message.errors.length > 0
          ? message.errors.join('; ')
          : `Claude Code run failed: ${message.subtype}`
      yield {
        type: EventType.RUN_ERROR,
        model,
        timestamp: now(),
        message: errorMessage,
        code: message.subtype,
        error: { message: errorMessage, code: message.subtype },
      }
    }
  }

  function* handleStreamEvent(
    message: SdkPartialAssistantMessage,
  ): Generator<StreamChunk> {
    const event = message.event
    if (event.type === 'message_start') {
      partialMessageId = event.message.id ?? genId()
      streamedMessageIds.add(partialMessageId)
    } else if (event.type === 'content_block_start') {
      partialBlockType = event.content_block.type
      if (partialBlockType === 'text') {
        partialTextMessageId = partialMessageId ?? genId()
        partialTextContent = ''
        if (!partialTextStarted) {
          partialTextStarted = true
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: partialTextMessageId,
            model,
            timestamp: now(),
            role: 'assistant',
          }
        }
      } else if (partialBlockType === 'thinking') {
        partialReasoningId = genId()
        yield {
          type: EventType.REASONING_START,
          messageId: partialReasoningId,
          model,
          timestamp: now(),
        }
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: partialReasoningId,
          role: 'reasoning' as const,
          model,
          timestamp: now(),
        }
      }
    } else if (event.type === 'content_block_delta') {
      if (
        event.delta.type === 'text_delta' &&
        partialTextStarted &&
        partialTextMessageId &&
        typeof event.delta.text === 'string'
      ) {
        partialTextContent += event.delta.text
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: partialTextMessageId,
          model,
          timestamp: now(),
          delta: event.delta.text,
          content: partialTextContent,
        }
      } else if (
        event.delta.type === 'thinking_delta' &&
        partialReasoningId &&
        typeof event.delta.thinking === 'string'
      ) {
        yield {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: partialReasoningId,
          delta: event.delta.thinking,
          model,
          timestamp: now(),
        }
      }
    } else if (event.type === 'content_block_stop') {
      if (partialBlockType === 'text') {
        yield* closePartialText()
      } else if (partialBlockType === 'thinking') {
        yield* closePartialReasoning()
      }
      partialBlockType = null
    }
  }

  try {
    for await (const sdkMessage of sdkMessages) {
      ctx.onSdkMessage?.(sdkMessage)

      if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
        yield* startRun()
        ctx.onSessionId?.(sdkMessage.session_id)
        yield {
          type: EventType.CUSTOM,
          model,
          timestamp: now(),
          name: SESSION_ID_EVENT,
          value: {
            sessionId: sdkMessage.session_id,
            model: sdkMessage.model,
            tools: sdkMessage.tools,
          },
        }
        continue
      }

      // Anything before init still needs RUN_STARTED first.
      yield* startRun()

      if (sdkMessage.type === 'stream_event') {
        if (sdkMessage.parent_tool_use_id !== null) continue
        yield* handleStreamEvent(sdkMessage)
      } else if (sdkMessage.type === 'assistant') {
        if (sdkMessage.parent_tool_use_id !== null) continue
        yield* handleAssistant(sdkMessage)
      } else if (sdkMessage.type === 'user') {
        if (sdkMessage.parent_tool_use_id !== null) continue
        yield* handleUser(sdkMessage)
      } else if (sdkMessage.type === 'result') {
        yield* handleResult(sdkMessage)
      }
      // All other SDK message types (status, hooks, notifications, ...) are
      // harness-internal and intentionally ignored.
    }
  } catch (error) {
    // The run is dying (abort or SDK failure). Pair any started tool calls
    // with a synthetic result first so the next request's pending-tool-call
    // scan doesn't try to execute them, then let the adapter surface the
    // error as RUN_ERROR.
    yield* synthesizeUnresolvedResults()
    throw error
  }
}
