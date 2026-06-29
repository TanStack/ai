import { EventType, buildBaseUsage } from '@tanstack/ai'
import type { StreamChunk, TokenUsage } from '@tanstack/ai'
import { GrokThoughtRouter } from './thought-router'
import type {
  GrokBuildStreamEvent,
  GrokBuildThreadItem,
  GrokBuildUsage,
} from './sdk-types'

/** Name of the CUSTOM event carrying the Grok Build session id. */
export const SESSION_ID_EVENT = 'grok-build.session-id'

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
  /** Called for each raw harness event, for logging. */
  onThreadEvent?: (event: GrokBuildStreamEvent) => void
}

/**
 * Resolve the AG-UI tool-call name for a Grok Build thread item.
 */
export function toolNameForItem(item: GrokBuildThreadItem): string {
  if (item.type === 'mcp_tool_call') {
    return item.server === BRIDGED_MCP_SERVER_NAME
      ? item.tool
      : `mcp__${item.server}__${item.tool}`
  }
  return item.type
}

type ToolItem = Extract<
  GrokBuildThreadItem,
  {
    type: 'command_execution' | 'mcp_tool_call' | 'file_change' | 'web_search'
  }
>

function toolArgsForItem(item: ToolItem): unknown {
  switch (item.type) {
    case 'command_execution':
      return { command: item.command }
    case 'mcp_tool_call':
      return item.arguments ?? {}
    case 'file_change':
      return { changes: item.changes }
    case 'web_search':
      return { query: item.query }
  }
}

function toolResultForItem(item: ToolItem): {
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
      return {
        content: text || JSON.stringify({ status: item.status }),
        isError: item.status === 'failed',
      }
    }
    case 'file_change':
      return {
        content: JSON.stringify({ changes: item.changes, status: item.status }),
        isError: item.status === 'failed',
      }
    case 'web_search':
      return { content: JSON.stringify({ query: item.query }), isError: false }
  }
}

function toUsage(usage: GrokBuildUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined
  const promptTokens = usage.input_tokens ?? 0
  const completionTokens = usage.output_tokens ?? 0
  return buildBaseUsage({
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  })
}

function isNativeEvent(
  event: GrokBuildStreamEvent,
): event is Extract<
  GrokBuildStreamEvent,
  { type: 'thought' | 'text' | 'end' }
> {
  return (
    event.type === 'thought' || event.type === 'text' || event.type === 'end'
  )
}

function* finalizeThoughtRouter(
  router: GrokThoughtRouter | null,
): Generator<StreamChunk> {
  if (router) yield* router.finalize()
}

function isLegacyEvent(event: GrokBuildStreamEvent): boolean {
  return (
    event.type === 'thread.started' ||
    event.type === 'turn.started' ||
    event.type === 'turn.completed' ||
    event.type === 'turn.failed' ||
    event.type === 'item.started' ||
    event.type === 'item.updated' ||
    event.type === 'item.completed'
  )
}

export async function* translateThreadEvents(
  events: AsyncIterable<GrokBuildStreamEvent>,
  ctx: TranslateContext,
): AsyncIterable<StreamChunk> {
  const {
    model,
    runId,
    threadId,
    parentRunId,
    genId,
    onSessionId,
    onThreadEvent,
  } = ctx
  const now = () => Date.now()

  let runStarted = false
  let runFinished = false
  let assistantMessageId: string | null = null
  let reasoningMessageId: string | null = null
  let thoughtRouter: GrokThoughtRouter | null = null

  const unresolvedToolCalls = new Set<string>()
  const openedToolItems = new Set<string>()

  const getThoughtRouter = () => {
    if (thoughtRouter === null) {
      thoughtRouter = new GrokThoughtRouter({
        model,
        genId,
        now,
      })
    }
    return thoughtRouter
  }

  function* startRun(): Generator<StreamChunk> {
    if (runStarted) return
    runStarted = true
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model,
      timestamp: now(),
      ...(parentRunId !== undefined && { parentRunId }),
    }
  }

  function* finishRun(usage?: GrokBuildUsage): Generator<StreamChunk> {
    if (runFinished) return
    runFinished = true
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      timestamp: now(),
      finishReason: 'stop',
      ...(toUsage(usage)
        ? { usage: toUsage(usage) as NonNullable<ReturnType<typeof toUsage>> }
        : {}),
    }
  }

  function* closeReasoning(): Generator<StreamChunk> {
    if (reasoningMessageId === null) return
    yield {
      type: EventType.REASONING_MESSAGE_END,
      messageId: reasoningMessageId,
      model,
      timestamp: now(),
    }
    yield {
      type: EventType.REASONING_END,
      messageId: reasoningMessageId,
      model,
      timestamp: now(),
    }
    reasoningMessageId = null
  }

  function* closeAssistant(): Generator<StreamChunk> {
    if (assistantMessageId === null) return
    yield {
      type: EventType.TEXT_MESSAGE_END,
      messageId: assistantMessageId,
      model,
      timestamp: now(),
    }
    assistantMessageId = null
  }

  function* handleNative(
    event: Extract<GrokBuildStreamEvent, { type: 'thought' | 'text' | 'end' }>,
  ): Generator<StreamChunk> {
    yield* startRun()

    switch (event.type) {
      case 'thought': {
        yield* getThoughtRouter().push(event.data)
        break
      }
      case 'text': {
        yield* getThoughtRouter().finalize()
        yield* closeReasoning()
        if (assistantMessageId === null) {
          assistantMessageId = genId()
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: assistantMessageId,
            model,
            timestamp: now(),
            role: 'assistant',
          }
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: assistantMessageId,
          delta: event.data,
          content: event.data,
          model,
          timestamp: now(),
        }
        break
      }
      case 'end': {
        yield* getThoughtRouter().finalize()
        yield* closeReasoning()
        yield* closeAssistant()
        if (event.sessionId) {
          onSessionId?.(event.sessionId)
          yield {
            type: EventType.CUSTOM,
            name: SESSION_ID_EVENT,
            value: { sessionId: event.sessionId },
            timestamp: now(),
            threadId,
            runId,
          }
        }
        yield* finishRun()
        break
      }
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

  function* openToolCall(item: ToolItem): Generator<StreamChunk> {
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

  function* handleItemCompleted(
    item: GrokBuildThreadItem,
  ): Generator<StreamChunk> {
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
        role: 'reasoning',
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
    } else if (
      item.type === 'command_execution' ||
      item.type === 'mcp_tool_call' ||
      item.type === 'file_change' ||
      item.type === 'web_search'
    ) {
      const toolItem = item as ToolItem // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
      yield* openToolCall(toolItem)
      unresolvedToolCalls.delete(item.id)
      const { content, isError } = toolResultForItem(toolItem)
      yield {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: item.id,
        messageId: genId(),
        model,
        timestamp: now(),
        content,
        ...(isError && { state: 'output-error' }),
      }
    }
  }

  try {
    for await (const event of events) {
      onThreadEvent?.(event)

      if (isNativeEvent(event)) {
        yield* handleNative(event)
        continue
      }

      if (event.type === 'error') {
        yield* synthesizeUnresolvedResults()
        yield* closeReasoning()
        yield* closeAssistant()
        yield {
          type: EventType.RUN_ERROR,
          runId,
          threadId,
          timestamp: now(),
          message: event.message,
          error: { message: event.message },
        }
        runFinished = true
        continue
      }

      if (!isLegacyEvent(event)) continue

      switch (event.type) {
        case 'thread.started': {
          onSessionId?.(event.thread_id)
          yield* startRun()
          yield {
            type: EventType.CUSTOM,
            name: SESSION_ID_EVENT,
            value: { sessionId: event.thread_id },
            timestamp: now(),
            threadId,
            runId,
          }
          break
        }
        case 'turn.started': {
          yield* startRun()
          break
        }
        case 'item.started':
        case 'item.updated':
        case 'item.completed': {
          const item = event.item
          if (
            item.type === 'agent_message' ||
            item.type === 'reasoning' ||
            item.type === 'command_execution' ||
            item.type === 'mcp_tool_call' ||
            item.type === 'file_change' ||
            item.type === 'web_search'
          ) {
            if (event.type === 'item.completed') {
              yield* handleItemCompleted(item)
            } else if (
              event.type === 'item.started' &&
              (item.type === 'command_execution' ||
                item.type === 'mcp_tool_call' ||
                item.type === 'file_change' ||
                item.type === 'web_search')
            ) {
              if (!openedToolItems.has(item.id)) {
                const tname = toolNameForItem(item)
                yield {
                  type: EventType.TOOL_CALL_START,
                  toolCallId: item.id,
                  toolCallName: tname,
                  toolName: tname,
                  model,
                  timestamp: now(),
                }
                openedToolItems.add(item.id)
                unresolvedToolCalls.add(item.id)
              }
            }
          }
          break
        }
        case 'turn.completed': {
          yield* synthesizeUnresolvedResults()
          yield* finishRun(event.usage)
          break
        }
        case 'turn.failed': {
          yield* synthesizeUnresolvedResults()
          const message = event.error?.message ?? 'Grok Build harness error'
          yield {
            type: EventType.RUN_ERROR,
            runId,
            threadId,
            timestamp: now(),
            message,
            error: { message },
          }
          runFinished = true
          break
        }
      }
    }
  } finally {
    yield* finalizeThoughtRouter(thoughtRouter)
    yield* synthesizeUnresolvedResults()
    yield* closeReasoning()
    yield* closeAssistant()
    if (!runFinished) yield* finishRun()
  }
}
