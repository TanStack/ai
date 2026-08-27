import { EventType, buildBaseUsage } from '@tanstack/ai'
import {
  parseJsonFromAssistantText,
  structuredOutputCompleteChunk,
  structuredOutputStartChunk,
} from '@tanstack/ai/adapter-internals'
import { GrokThoughtRouter } from './thought-router'
import type { AdapterYieldChunk, TokenUsage } from '@tanstack/ai'
import type {
  GrokBuildStreamEvent,
  GrokBuildThreadItem,
  GrokBuildUsage,
} from './sdk-types'

/** Name of the CUSTOM event carrying the Grok Build session id. */
export const /** Name of the CUSTOM event carrying the Grok Build session id. */
SESSION_ID_EVENT = 'grok-build.session-id'

/** Server name used for bridged TanStack tools. */
export const /** Server name used for bridged TanStack tools. */
BRIDGED_MCP_SERVER_NAME = 'tanstack'

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
  /** Parse accumulated assistant text as schema JSON at run end. */
  expectStructuredOutput?: boolean
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
): Generator<AdapterYieldChunk> {
  if (router) yield* router.finalize()
}

function isToolItem(item: GrokBuildThreadItem): item is ToolItem {
  return (
    item.type === 'command_execution' ||
    item.type === 'mcp_tool_call' ||
    item.type === 'file_change' ||
    item.type === 'web_search'
  )
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
): AsyncIterable<AdapterYieldChunk> {
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
  let assistantText = ''

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

  function* startRun(): Generator<AdapterYieldChunk> {
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

  function* finishRun(usage?: GrokBuildUsage): Generator<AdapterYieldChunk> {
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

  function* closeReasoning(): Generator<AdapterYieldChunk> {
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

  function* closeAssistant(): Generator<AdapterYieldChunk> {
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
  ): Generator<AdapterYieldChunk> {
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
        assistantText += event.data
        break
      }
      case 'end': {
        yield* getThoughtRouter().finalize()
        yield* closeReasoning()
        yield* closeAssistant()
        if (ctx.expectStructuredOutput === true) {
          try {
            const object = parseJsonFromAssistantText(assistantText)
            const messageId = genId()
            yield structuredOutputStartChunk({
              messageId,
              model,
              threadId,
              runId,
            })
            yield structuredOutputCompleteChunk({
              messageId,
              model,
              threadId,
              runId,
              object,
              raw: assistantText,
            })
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? error.message
                : 'Failed to parse structured output'
            yield {
              type: EventType.RUN_ERROR,
              model,
              timestamp: now(),
              message,
              error: { message },
            }
          }
        }
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

  function* openToolCall(item: ToolItem): Generator<AdapterYieldChunk> {
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

  function* handleLegacyItemProgress(
    event: Extract<
      GrokBuildStreamEvent,
      { type: 'item.started' | 'item.updated' | 'item.completed' }
    >,
  ): Generator<AdapterYieldChunk> {
    const item = event.item
    const isTrackedItem =
      item.type === 'agent_message' ||
      item.type === 'reasoning' ||
      item.type === 'command_execution' ||
      item.type === 'mcp_tool_call' ||
      item.type === 'file_change' ||
      item.type === 'web_search'
    if (!isTrackedItem) {
      return
    }
    if (event.type === 'item.completed') {
      yield* handleItemCompleted(item)
      return
    }
    if (event.type !== 'item.started') return
    if (!isToolItem(item)) return
    if (openedToolItems.has(item.id)) return
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

  function* handleLegacyEvent(
    event: Extract<GrokBuildStreamEvent, { type: string }> & {
      type:
        | 'thread.started'
        | 'turn.started'
        | 'turn.completed'
        | 'turn.failed'
        | 'item.started'
        | 'item.updated'
        | 'item.completed'
    },
  ): Generator<AdapterYieldChunk> {
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
        return
      }
      case 'turn.started': {
        yield* startRun()
        return
      }
      case 'item.started':
      case 'item.updated':
      case 'item.completed': {
        yield* handleLegacyItemProgress(event)
        return
      }
      case 'turn.completed': {
        yield* synthesizeUnresolvedResults()
        yield* finishRun(event.usage)
        return
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
      }
    }
  }

  function* handleItemCompleted(
    item: GrokBuildThreadItem,
  ): Generator<AdapterYieldChunk> {
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
    } else {
      const isToolItemType =
        item.type === 'command_execution' ||
        item.type === 'mcp_tool_call' ||
        item.type === 'file_change' ||
        item.type === 'web_search'
      if (isToolItemType) {
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
      yield* handleLegacyEvent(event)
    }
  } finally {
    yield* finalizeThoughtRouter(thoughtRouter)
    yield* synthesizeUnresolvedResults()
    yield* closeReasoning()
    yield* closeAssistant()
    if (!runFinished) yield* finishRun()
  }
}
