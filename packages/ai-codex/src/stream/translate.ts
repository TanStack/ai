import { EventType, buildBaseUsage } from '@tanstack/ai'
import {
  parseJsonFromAssistantText,
  structuredOutputCompleteChunk,
  structuredOutputStartChunk,
} from '@tanstack/ai/adapter-internals'
import type { AdapterYieldChunk, TokenUsage } from '@tanstack/ai'
import type { CodexThreadEvent, CodexThreadItem, CodexUsage } from './sdk-types'

/** Name of the CUSTOM event carrying the Codex thread (session) id. */
export const SESSION_ID_EVENT = 'codex.session-id'

/** Server name used for bridged TanStack tools. */
export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

export interface TranslateContext {
  model: string
  runId: string
  threadId: string
  parentRunId?: string
  genId: () => string
  /** Called as soon as the harness reports its thread id. */
  onSessionId?: (sessionId: string) => void
  /** Called for each raw SDK thread event, for logging. */
  onThreadEvent?: (event: CodexThreadEvent) => void
  /** Treat the last agent_message as schema JSON. */
  expectStructuredOutput?: boolean
}

export function toolNameForItem(item: CodexThreadItem): string {
  if (item.type === 'mcp_tool_call') {
    return item.server === BRIDGED_MCP_SERVER_NAME
      ? item.tool
      : `mcp__${item.server}__${item.tool}`
  }
  return item.type
}

/** Thread items the translator surfaces as already-resolved tool calls. */
type CodexToolItem = Extract<
  CodexThreadItem,
  {
    type:
      | 'command_execution'
      | 'mcp_tool_call'
      | 'file_change'
      | 'web_search'
      | 'todo_list'
  }
>

function toolArgsForItem(item: CodexToolItem): unknown {
  switch (item.type) {
    case 'command_execution':
      return { command: item.command }
    case 'mcp_tool_call':
      return item.arguments ?? {}
    case 'file_change':
      return { changes: item.changes }
    case 'web_search':
      return { query: item.query }
    case 'todo_list':
      return {}
  }
}

function toolResultForItem(item: CodexToolItem): {
  content: string
  isError: boolean
} {
  switch (item.type) {
    case 'command_execution':
      return {
        content: JSON.stringify({
          aggregated_output: item.aggregated_output ?? '',
          ...(item.exit_code !== undefined && { exit_code: item.exit_code }),
          status: item.status,
        }),
        isError: item.status === 'failed',
      }
    case 'mcp_tool_call': {
      if (item.error) {
        return { content: item.error.message, isError: true }
      }
      const text = (item.result?.content ?? [])
        .map((block) => (typeof block.text === 'string' ? block.text : ''))
        .join('')
      if (text !== '') {
        return { content: text, isError: item.status === 'failed' }
      }
      if (item.result?.structured_content !== undefined) {
        return {
          content: JSON.stringify(item.result.structured_content),
          isError: item.status === 'failed',
        }
      }
      return {
        content: JSON.stringify({ status: item.status }),
        isError: item.status === 'failed',
      }
    }
    case 'file_change':
      return {
        content: JSON.stringify({ changes: item.changes, status: item.status }),
        isError: item.status === 'failed',
      }
    case 'web_search':
      return {
        content: JSON.stringify({ status: 'completed' }),
        isError: false,
      }
    case 'todo_list':
      return { content: JSON.stringify({ items: item.items }), isError: false }
  }
}

function isToolItem(item: CodexThreadItem): item is CodexToolItem {
  return (
    item.type === 'command_execution' ||
    item.type === 'mcp_tool_call' ||
    item.type === 'file_change' ||
    item.type === 'web_search' ||
    item.type === 'todo_list'
  )
}

function buildUsage(usage: CodexUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  const promptTokens = usage.input_tokens ?? 0
  const completionTokens = usage.output_tokens ?? 0
  const result = buildBaseUsage({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  })
  if (usage.cached_input_tokens) {
    result.promptTokensDetails = { cachedTokens: usage.cached_input_tokens }
  }
  if (usage.reasoning_output_tokens) {
    result.completionTokensDetails = {
      reasoningTokens: usage.reasoning_output_tokens,
    }
  }
  return result
}

export async function* translateThreadEvents(
  events: AsyncIterable<CodexThreadEvent>,
  ctx: TranslateContext,
): AsyncIterable<AdapterYieldChunk> {
  const { model, runId, threadId, genId } = ctx
  const now = () => Date.now()

  let runStarted = false
  /** Tool calls started but with no result yet. */
  const unresolvedToolCalls = new Set<string>()
  /** Item ids that already emitted TOOL_CALL_START/ARGS/END. */
  const openedToolItems = new Set<string>()

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

  function* openToolCall(item: CodexToolItem): Generator<AdapterYieldChunk> {
    if (openedToolItems.has(item.id)) return
    openedToolItems.add(item.id)
    const toolCallName = toolNameForItem(item)
    const input = toolArgsForItem(item)
    const args = JSON.stringify(input)
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: item.id,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
    }
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: item.id,
      model,
      timestamp: now(),
      delta: args,
      args,
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: item.id,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
      input,
    }
    unresolvedToolCalls.add(item.id)
  }

  const openText = new Map<string, { emitted: number; ended: boolean }>()
  let lastAgentMessage: { id: string; text: string } | undefined

  function* startText(messageId: string): Generator<AdapterYieldChunk> {
    if (openText.has(messageId)) return
    openText.set(messageId, { emitted: 0, ended: false })
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      model,
      timestamp: now(),
      role: 'assistant',
    }
  }

  function* emitTextDelta(
    messageId: string,
    text: string,
  ): Generator<AdapterYieldChunk> {
    yield* startText(messageId)
    const state = openText.get(messageId)
    if (state === undefined) return
    if (state.ended) return
    if (text.length <= state.emitted) return
    const delta = text.slice(state.emitted)
    state.emitted = text.length
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      model,
      timestamp: now(),
      delta,
      content: text,
    }
  }

  function* endText(messageId: string): Generator<AdapterYieldChunk> {
    const state = openText.get(messageId)
    if (state === undefined) return
    if (state.ended) return
    state.ended = true
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      model,
      timestamp: now(),
    }
  }

  function* handleAgentMessage(
    item: { id: string; text: string },
    done: boolean,
  ): Generator<AdapterYieldChunk> {
    yield* emitTextDelta(item.id, item.text)
    lastAgentMessage = { id: item.id, text: item.text }
    if (done) yield* endText(item.id)
  }

  function* emitStructuredFromLast(): Generator<AdapterYieldChunk> {
    if (ctx.expectStructuredOutput !== true) return
    if (lastAgentMessage === undefined) return
    const item = lastAgentMessage
    lastAgentMessage = undefined
    try {
      const object = parseJsonFromAssistantText(item.text)
      yield structuredOutputStartChunk({
        messageId: item.id,
        model,
        threadId,
        runId,
      })
      yield structuredOutputCompleteChunk({
        messageId: item.id,
        model,
        threadId,
        runId,
        object,
        raw: item.text,
      })
    } catch (error: unknown) {
      const parserMessage =
        error instanceof Error
          ? error.message
          : 'Invalid structured output JSON'
      const preview = item.text.trim().slice(0, 200)
      const message =
        preview === '' ? parserMessage : `${parserMessage} Content: ${preview}`
      yield {
        type: EventType.RUN_ERROR,
        model,
        timestamp: now(),
        message,
        code: 'structured-output-parse-failed',
        error: { message, code: 'structured-output-parse-failed' },
      }
    }
  }

  function* handleItemCompleted(
    item: CodexThreadItem,
  ): Generator<AdapterYieldChunk> {
    if (item.type === 'agent_message') {
      yield* handleAgentMessage(item, true)
    } else if (item.type === 'reasoning') {
      const reasoningId = item.id
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
        delta: item.text,
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
    } else if (isToolItem(item)) {
      yield* openToolCall(item)
      unresolvedToolCalls.delete(item.id)
      const { content, isError } = toolResultForItem(item)
      yield {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: item.id,
        messageId: genId(),
        model,
        timestamp: now(),
        content,
        ...(isError && { state: 'output-error' as const }),
      }
    }
    // `error` items are non-fatal diagnostics; `turn.failed` is the fatal
    // signal. They are surfaced via onThreadEvent logging only.
  }

  try {
    for await (const event of events) {
      ctx.onThreadEvent?.(event)

      if (event.type === 'thread.started') {
        yield* startRun()
        ctx.onSessionId?.(event.thread_id)
        yield {
          type: EventType.CUSTOM,
          model,
          timestamp: now(),
          name: SESSION_ID_EVENT,
          value: { sessionId: event.thread_id },
        }
        continue
      }

      // Resumed threads don't re-emit thread.started; anything else still
      // needs RUN_STARTED first.
      yield* startRun()

      if (event.type === 'item.started') {
        if (event.item.type === 'agent_message') {
          yield* handleAgentMessage(event.item, false)
        } else if (isToolItem(event.item)) {
          yield* openToolCall(event.item)
        }
      } else if (event.type === 'item.updated') {
        if (event.item.type === 'agent_message') {
          yield* handleAgentMessage(event.item, false)
        }
      } else if (event.type === 'item.completed') {
        yield* handleItemCompleted(event.item)
      } else if (event.type === 'turn.completed') {
        yield* emitStructuredFromLast()
        yield* synthesizeUnresolvedResults()
        const usage = buildUsage(event.usage)
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model,
          timestamp: now(),
          finishReason: 'stop',
          ...(usage !== undefined && { usage }),
        }
      } else if (event.type === 'turn.failed') {
        yield* synthesizeUnresolvedResults()
        const message = event.error?.message ?? 'Codex turn failed'
        yield {
          type: EventType.RUN_ERROR,
          model,
          timestamp: now(),
          message,
          error: { message },
        }
      } else if (event.type === 'error') {
        yield* synthesizeUnresolvedResults()
        const message = event.message
        yield {
          type: EventType.RUN_ERROR,
          model,
          timestamp: now(),
          message,
          error: { message },
        }
      }
      // turn.started carries no chunk-stream state. item.updated for tools
      // (streaming command output, todo ticks) is dropped on purpose.
    }
    yield* emitStructuredFromLast()
  } catch (error) {
    yield* synthesizeUnresolvedResults()
    throw error
  }
}
