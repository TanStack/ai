import { EventType, buildBaseUsage } from '@tanstack/ai'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'
import type {
  AcpSessionUpdate,
  AcpStopReason,
  AcpToolCallUpdate,
  AcpUsage,
} from './acp-types'

/** Name of the CUSTOM event carrying the Gemini CLI session id. */
export const SESSION_ID_EVENT = 'gemini-cli.session-id'

/** Name of the CUSTOM event carrying the harness's plan updates. */
export const PLAN_EVENT = 'gemini-cli.plan'

/** Server name used for bridged TanStack tools. */
export const BRIDGED_MCP_SERVER_NAME = 'tanstack'

/**
 * Events fed to the translator: the session id once established, every ACP
 * `session/update` notification, and a terminal `done` carrying the prompt
 * response's stop reason (the adapter's async queue produces these).
 */
export type AcpStreamEvent =
  | { kind: 'session'; sessionId: string }
  | { kind: 'update'; update: AcpSessionUpdate }
  | { kind: 'done'; stopReason: AcpStopReason; usage?: AcpUsage }

export interface TranslateContext {
  model: string
  runId: string
  threadId: string
  parentRunId?: string
  genId: () => string
  /**
   * Names of bridged TanStack tools, used to surface the harness's MCP tool
   * calls under the names the application registered.
   */
  bridgedToolNames?: ReadonlySet<string>
  /** Called for each raw ACP stream event, for logging. */
  onAcpEvent?: (event: AcpStreamEvent) => void
}

/**
 * Match an ACP tool-call title against the bridged TanStack tool names.
 * Gemini CLI labels MCP tools with the tool name, optionally suffixed with
 * the server it came from (e.g. `lookup_user (tanstack MCP Server)`).
 */
export function matchBridgedToolName(
  title: string | null | undefined,
  bridgedToolNames: ReadonlySet<string> | undefined,
): string | undefined {
  if (!title || !bridgedToolNames) return undefined
  if (bridgedToolNames.has(title)) return title
  for (const name of bridgedToolNames) {
    if (title.startsWith(`${name} (`)) return name
  }
  return undefined
}

function resolveToolName(
  update: AcpToolCallUpdate,
  bridgedToolNames: ReadonlySet<string> | undefined,
): string {
  return (
    matchBridgedToolName(update.title, bridgedToolNames) ??
    update.kind ??
    'tool'
  )
}

function stringifyToolOutput(update: AcpToolCallUpdate): string {
  if (update.rawOutput !== undefined) {
    return typeof update.rawOutput === 'string'
      ? update.rawOutput
      : JSON.stringify(update.rawOutput)
  }
  const text = (update.content ?? [])
    .map((block) =>
      block.content && typeof block.content.text === 'string'
        ? block.content.text
        : '',
    )
    .join('')
  if (text !== '') return text
  return JSON.stringify({ status: update.status ?? 'completed' })
}

function buildUsage(usage: AcpUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  const promptTokens = usage.inputTokens ?? 0
  const completionTokens = usage.outputTokens ?? 0
  const result = buildBaseUsage({
    promptTokens,
    completionTokens,
    totalTokens: usage.totalTokens ?? promptTokens + completionTokens,
  })
  if (usage.cachedReadTokens) {
    result.promptTokensDetails = { cachedTokens: usage.cachedReadTokens }
  }
  if (usage.thoughtTokens) {
    result.completionTokensDetails = { reasoningTokens: usage.thoughtTokens }
  }
  return result
}

/**
 * Translate a Gemini CLI ACP event stream into AG-UI StreamChunk events.
 *
 * The harness runs its own agent loop and executes its own tools, so the
 * translation always ends with `finishReason: 'stop'` (or `'length'` /
 * RUN_ERROR) — never `'tool_calls'`. Harness tool activity is emitted as
 * already-resolved TOOL_CALL_START/ARGS/END + TOOL_CALL_RESULT sequences so
 * UIs can render it, while the TanStack engine never tries to execute them.
 *
 * ACP delivers true token-level deltas for both assistant text
 * (`agent_message_chunk`) and thinking (`agent_thought_chunk`).
 *
 * Invariant: every TOOL_CALL_START is eventually paired with a
 * TOOL_CALL_RESULT (synthesized as `{"status":"interrupted"}` when the run
 * ends or aborts before the harness reported one) so the engine's
 * pending-tool-call scan on the next request never force-executes them.
 */
export async function* translateAcpStream(
  events: AsyncIterable<AcpStreamEvent>,
  ctx: TranslateContext,
): AsyncIterable<StreamChunk> {
  const { model, runId, threadId, genId } = ctx
  const now = () => Date.now()

  let runStarted = false
  /** Tool calls started but with no result yet. */
  const unresolvedToolCalls = new Set<string>()
  /** Tool names by id, for synthetic opens on unknown tool_call_update ids. */
  const knownToolCalls = new Set<string>()

  let textMessageId: string | null = null
  let textContent = ''
  let reasoningId: string | null = null

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

  function* closeText(): Generator<StreamChunk> {
    if (textMessageId !== null) {
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: textMessageId,
        model,
        timestamp: now(),
      }
    }
    textMessageId = null
    textContent = ''
  }

  function* closeReasoning(): Generator<StreamChunk> {
    if (reasoningId !== null) {
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
    }
    reasoningId = null
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

  function* openToolCall(update: AcpToolCallUpdate): Generator<StreamChunk> {
    if (knownToolCalls.has(update.toolCallId)) return
    knownToolCalls.add(update.toolCallId)
    const toolCallName = resolveToolName(update, ctx.bridgedToolNames)
    const input = {
      ...(update.title != null && { title: update.title }),
      ...(update.rawInput !== undefined && update.rawInput !== null
        ? typeof update.rawInput === 'object'
          ? (update.rawInput as Record<string, unknown>)
          : { input: update.rawInput }
        : {}),
    }
    const args = JSON.stringify(input)
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: update.toolCallId,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
    }
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: update.toolCallId,
      model,
      timestamp: now(),
      delta: args,
      args,
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId: update.toolCallId,
      toolCallName,
      toolName: toolCallName,
      model,
      timestamp: now(),
      input,
    }
    unresolvedToolCalls.add(update.toolCallId)
  }

  function* resolveToolCall(update: AcpToolCallUpdate): Generator<StreamChunk> {
    yield* openToolCall(update)
    unresolvedToolCalls.delete(update.toolCallId)
    yield {
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: update.toolCallId,
      messageId: genId(),
      model,
      timestamp: now(),
      content: stringifyToolOutput(update),
      ...(update.status === 'failed' && { state: 'output-error' as const }),
    }
  }

  function* handleUpdate(update: AcpSessionUpdate): Generator<StreamChunk> {
    if (update.sessionUpdate === 'agent_message_chunk') {
      yield* closeReasoning()
      const text =
        typeof update.content.text === 'string' ? update.content.text : ''
      if (text === '') return
      if (textMessageId === null) {
        textMessageId = genId()
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: textMessageId,
          model,
          timestamp: now(),
          role: 'assistant',
        }
      }
      textContent += text
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: textMessageId,
        model,
        timestamp: now(),
        delta: text,
        content: textContent,
      }
    } else if (update.sessionUpdate === 'agent_thought_chunk') {
      yield* closeText()
      const thought =
        typeof update.content.text === 'string' ? update.content.text : ''
      if (thought === '') return
      if (reasoningId === null) {
        reasoningId = genId()
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
      }
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningId,
        delta: thought,
        model,
        timestamp: now(),
      }
    } else if (update.sessionUpdate === 'tool_call') {
      yield* closeText()
      yield* closeReasoning()
      yield* openToolCall(update)
      if (update.status === 'completed' || update.status === 'failed') {
        yield* resolveToolCall(update)
      }
    } else if (update.sessionUpdate === 'tool_call_update') {
      if (update.status === 'completed' || update.status === 'failed') {
        yield* resolveToolCall(update)
      }
      // pending / in_progress updates carry no state the chunk stream needs.
    } else if (update.sessionUpdate === 'plan') {
      yield {
        type: EventType.CUSTOM,
        model,
        timestamp: now(),
        name: PLAN_EVENT,
        value: { entries: update.entries },
      }
    }
    // Other update types (available_commands_update, current_mode_update,
    // user_message_chunk replays, ...) are harness-internal and ignored.
  }

  try {
    for await (const event of events) {
      ctx.onAcpEvent?.(event)

      if (event.kind === 'session') {
        yield* startRun()
        yield {
          type: EventType.CUSTOM,
          model,
          timestamp: now(),
          name: SESSION_ID_EVENT,
          value: { sessionId: event.sessionId },
        }
      } else if (event.kind === 'update') {
        yield* startRun()
        yield* handleUpdate(event.update)
      } else {
        yield* startRun()
        yield* closeText()
        yield* closeReasoning()
        yield* synthesizeUnresolvedResults()

        if (event.stopReason === 'refusal') {
          yield {
            type: EventType.RUN_ERROR,
            model,
            timestamp: now(),
            message: 'Gemini CLI refused the request.',
            code: 'refusal',
            error: {
              message: 'Gemini CLI refused the request.',
              code: 'refusal',
            },
          }
        } else {
          const usage = buildUsage(event.usage)
          const finishReason =
            event.stopReason === 'max_tokens' ||
            event.stopReason === 'max_turn_requests'
              ? ('length' as const)
              : ('stop' as const)
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
      }
    }
  } catch (error) {
    // The run is dying (abort, process exit, or connection failure). Close
    // any open message and pair started tool calls with a synthetic result
    // first so the next request's pending-tool-call scan doesn't try to
    // execute them, then let the adapter surface the error as RUN_ERROR.
    yield* closeText()
    yield* closeReasoning()
    yield* synthesizeUnresolvedResults()
    throw error
  }
}
