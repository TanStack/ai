import { EventType, buildBaseUsage } from '@tanstack/ai'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'
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
}

/**
 * Resolve the AG-UI tool-call name for a Codex thread item. Bridged TanStack
 * tools come back as `mcp_tool_call` items on the `tanstack` server and are
 * surfaced under the names the application registered; foreign MCP tools are
 * namespaced `mcp__<server>__<tool>`; harness-native items use their item
 * type verbatim (`command_execution`, `file_change`, ...).
 */
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

/**
 * Translate a Codex SDK thread-event stream into AG-UI StreamChunk events.
 *
 * The harness runs its own agent loop and executes its own tools, so the
 * translation always ends with `finishReason: 'stop'` (or RUN_ERROR) — never
 * `'tool_calls'`. Harness tool activity (commands, file changes, MCP calls,
 * web searches, todo lists) is emitted as already-resolved
 * TOOL_CALL_START/ARGS/END + TOOL_CALL_RESULT sequences so UIs can render it
 * while the TanStack engine never tries to execute them.
 *
 * Codex reports assistant text and reasoning only as completed items (no
 * token-level deltas), so each `agent_message` / `reasoning` item becomes a
 * single START/CONTENT/END burst.
 *
 * Invariant: every TOOL_CALL_START is eventually paired with a
 * TOOL_CALL_RESULT (synthesized as `{"status":"interrupted"}` when the run
 * ends or aborts before the harness reported one) so the engine's
 * pending-tool-call scan on the next request never force-executes them.
 */
export async function* translateThreadEvents(
  events: AsyncIterable<CodexThreadEvent>,
  ctx: TranslateContext,
): AsyncIterable<StreamChunk> {
  const { model, runId, threadId, genId } = ctx
  const now = () => Date.now()

  let runStarted = false
  /** Tool calls started but with no result yet. */
  const unresolvedToolCalls = new Set<string>()
  /** Item ids that already emitted TOOL_CALL_START/ARGS/END. */
  const openedToolItems = new Set<string>()

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

  function* openToolCall(item: CodexToolItem): Generator<StreamChunk> {
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

  function* handleItemCompleted(item: CodexThreadItem): Generator<StreamChunk> {
    if (item.type === 'agent_message') {
      const messageId = item.id
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
        delta: item.text,
        content: item.text,
      }
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        model,
        timestamp: now(),
      }
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
        if (isToolItem(event.item)) {
          yield* openToolCall(event.item)
        }
      } else if (event.type === 'item.completed') {
        yield* handleItemCompleted(event.item)
      } else if (event.type === 'turn.completed') {
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
      } else if (event.type === 'turn.failed' || event.type === 'error') {
        yield* synthesizeUnresolvedResults()
        const message =
          event.type === 'turn.failed'
            ? (event.error?.message ?? 'Codex turn failed')
            : event.message
        yield {
          type: EventType.RUN_ERROR,
          model,
          timestamp: now(),
          message,
          error: { message },
        }
      }
      // turn.started and item.updated carry no state the chunk stream needs:
      // long-running items resolve via item.completed, and intermediate
      // updates (e.g. streaming command output) are intentionally dropped.
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
