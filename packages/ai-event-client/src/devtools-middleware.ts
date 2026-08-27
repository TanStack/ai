import { aiEventClient } from './index.js'
import type { TokenUsage } from './index.js'

// Local mirrors of @tanstack/ai middleware types — do not import from `@tanstack/ai`.
// Importing it here would duplicate types during the engine's own build.

interface DevtoolsModelMessage {
  role: string
  content: unknown
  toolCalls?: unknown
}

type DevtoolsSystemPrompt = string | { content: string; metadata?: unknown }

interface DevtoolsSpecTokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

interface DevtoolsTextMessageContentChunk {
  type: 'TEXT_MESSAGE_CONTENT'
  delta: string
}
interface DevtoolsToolCallStartChunk {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolCallName: string
  index?: number
}
interface DevtoolsToolCallArgsChunk {
  type: 'TOOL_CALL_ARGS'
  toolCallId: string
  delta: string
}
interface DevtoolsToolCallEndChunk {
  type: 'TOOL_CALL_END'
  toolCallId: string
}
interface DevtoolsToolCallResultChunk {
  type: 'TOOL_CALL_RESULT'
  toolCallId: string
  content?: string
}
interface DevtoolsRunFinishedChunk {
  type: 'RUN_FINISHED'
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
  usage?: Array<DevtoolsSpecTokenUsage> | TokenUsage
  metadata?: {
    tanstack?: {
      finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null
      usage?: Omit<
        TokenUsage,
        'promptTokens' | 'completionTokens' | 'totalTokens'
      >
    }
  }
}
interface DevtoolsRunErrorChunk {
  type: 'RUN_ERROR'
  message?: string
  code?: string
}
interface DevtoolsReasoningMessageContentChunk {
  type: 'REASONING_MESSAGE_CONTENT'
  delta: string
}
type DevtoolsKnownChunk =
  | DevtoolsTextMessageContentChunk
  | DevtoolsToolCallStartChunk
  | DevtoolsToolCallArgsChunk
  | DevtoolsToolCallEndChunk
  | DevtoolsToolCallResultChunk
  | DevtoolsRunFinishedChunk
  | DevtoolsRunErrorChunk
  | DevtoolsReasoningMessageContentChunk

type DevtoolsStreamChunk = { type: string }

const KNOWN_CHUNK_TYPES: ReadonlySet<DevtoolsKnownChunk['type']> = new Set([
  'TEXT_MESSAGE_CONTENT',
  'TOOL_CALL_START',
  'TOOL_CALL_ARGS',
  'TOOL_CALL_END',
  'TOOL_CALL_RESULT',
  'RUN_FINISHED',
  'RUN_ERROR',
  'REASONING_MESSAGE_CONTENT',
])

function isTypedChunk(chunk: unknown): chunk is DevtoolsStreamChunk {
  return (
    typeof chunk === 'object' &&
    chunk !== null &&
    'type' in chunk &&
    typeof chunk.type === 'string'
  )
}

function isKnownChunk(chunk: unknown): chunk is DevtoolsKnownChunk {
  return (
    isTypedChunk(chunk) &&
    (KNOWN_CHUNK_TYPES as ReadonlySet<string>).has(chunk.type)
  )
}

function chunkTanstack(chunk: DevtoolsRunFinishedChunk) {
  const tanstack = chunk.metadata?.tanstack
  if (tanstack == null || typeof tanstack !== 'object') return undefined
  return tanstack
}

function definedDetails<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

function fromSpecTokenUsage(
  usage: ReadonlyArray<DevtoolsSpecTokenUsage> | undefined,
  leftover?: Omit<
    TokenUsage,
    'promptTokens' | 'completionTokens' | 'totalTokens'
  >,
): TokenUsage | undefined {
  const spec = usage?.[0]
  if (spec == null && leftover == null) {
    return undefined
  }

  const {
    promptTokensDetails: leftoverPromptDetails,
    completionTokensDetails: leftoverCompletionDetails,
    ...leftoverRest
  } = leftover ?? {}

  const promptTokensDetails = definedDetails({
    ...(spec?.cachedInputTokens !== undefined
      ? { cachedTokens: spec.cachedInputTokens }
      : {}),
    ...leftoverPromptDetails,
  })
  const completionTokensDetails = definedDetails({
    ...(spec?.reasoningTokens !== undefined
      ? { reasoningTokens: spec.reasoningTokens }
      : {}),
    ...leftoverCompletionDetails,
  })

  return {
    promptTokens: spec?.inputTokens ?? 0,
    completionTokens: spec?.outputTokens ?? 0,
    totalTokens: spec?.totalTokens ?? 0,
    ...leftoverRest,
    ...(promptTokensDetails !== undefined ? { promptTokensDetails } : {}),
    ...(completionTokensDetails !== undefined
      ? { completionTokensDetails }
      : {}),
  }
}

interface DevtoolsMiddlewareContext {
  requestId: string
  streamId: string
  runId: string
  threadId: string
  conversationId?: string
  provider: string
  model: string
  source: 'client' | 'server'
  systemPrompts: ReadonlyArray<DevtoolsSystemPrompt>
  toolNames?: Array<string>
  options?: Record<string, unknown>
  modelOptions?: Record<string, unknown>
  messageCount: number
  hasTools: boolean
  streaming: boolean
  messages: ReadonlyArray<DevtoolsModelMessage>
  createId: (prefix: string) => string
}

interface DevtoolsIterationInfo {
  iteration: number
  messageId: string
}

interface DevtoolsToolPhaseCompleteInfo {
  toolCalls: Array<unknown>
  needsApproval: Array<{
    toolCallId: string
    toolName: string
    input: unknown
    approvalId: string
  }>
  needsClientExecution: Array<{
    toolCallId: string
    toolName: string
    input: unknown
  }>
  results: Array<{
    toolCallId: string
    toolName: string
    result: unknown
    duration?: number
  }>
}

interface DevtoolsFinishInfo {
  content: string
  finishReason: string | null
  duration: number
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface DevtoolsChatMiddleware {
  name?: string
  onStart?: (ctx: DevtoolsMiddlewareContext) => void | Promise<void>
  onIteration?: (
    ctx: DevtoolsMiddlewareContext,
    info: DevtoolsIterationInfo,
  ) => void | Promise<void>
  onChunk?: (
    ctx: DevtoolsMiddlewareContext,
    chunk: unknown,
  ) => void | Promise<void>
  onToolPhaseComplete?: (
    ctx: DevtoolsMiddlewareContext,
    info: DevtoolsToolPhaseCompleteInfo,
  ) => void | Promise<void>
  onFinish?: (
    ctx: DevtoolsMiddlewareContext,
    info: DevtoolsFinishInfo,
  ) => void | Promise<void>
}

const safeEmit: typeof aiEventClient.emit = (...args) => {
  try {
    aiEventClient.emit(...args)
  } catch (error) {
    console.error(
      `[ai-devtools] subscriber threw while handling "${String(args[0])}" event`,
      error,
    )
  }
}

function buildEventContext(ctx: DevtoolsMiddlewareContext) {
  return {
    requestId: ctx.requestId,
    streamId: ctx.streamId,
    runId: ctx.runId,
    threadId: ctx.threadId,
    provider: ctx.provider,
    model: ctx.model,
    clientId: ctx.conversationId,
    source: ctx.source,
    systemPrompts:
      ctx.systemPrompts.length > 0
        ? ctx.systemPrompts.map((p) => (typeof p === 'string' ? p : p.content))
        : undefined,
    toolNames: ctx.toolNames,
    options: ctx.options,
    modelOptions: ctx.modelOptions,
    messageCount: ctx.messageCount,
    hasTools: ctx.hasTools,
    streaming: ctx.streaming,
  }
}

/**
 * Extract text content from a ModelMessage content field.
 */
function getContentString(content: DevtoolsModelMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (
    content
      .map((part) =>
        part &&
        typeof part === 'object' &&
        (part as { type?: string }).type === 'text'
          ? String((part as { content?: unknown }).content ?? '')
          : '',
      )
      .join('') || ''
  )
}

/**
 * Internal devtools middleware that emits all DevTools events.
 * Auto-injected as the FIRST middleware in the TextEngine.
 *
 * All hooks are observation-only — `onChunk` returns void to pass through
 * without transforming chunks.
 */
export function devtoolsMiddleware(): DevtoolsChatMiddleware {
  // Local mutable state — tracked here because the devtools middleware
  // runs first, before the engine updates ctx.currentMessageId / ctx.accumulatedContent
  let localMessageId: string | null = null
  let localAccumulatedContent = ''
  let localAccumulatedThinking = ''
  let currentIteration = -1
  let iterationStartTime = 0
  const activeToolCalls = new Map<string, { toolName: string; index: number }>()

  type ChunkBase = ReturnType<typeof buildEventContext>
  const chunkHandlers = {
    TEXT_MESSAGE_CONTENT: (
      chunk: DevtoolsTextMessageContentChunk,
      base: ChunkBase,
    ) => {
      localAccumulatedContent += chunk.delta
      safeEmit('text:chunk:content', {
        ...base,
        messageId: localMessageId || undefined,
        content: localAccumulatedContent,
        delta: chunk.delta,
        timestamp: Date.now(),
      })
    },
    TOOL_CALL_START: (chunk: DevtoolsToolCallStartChunk, base: ChunkBase) => {
      const toolIndex = chunk.index ?? 0
      const toolName = chunk.toolCallName
      activeToolCalls.set(chunk.toolCallId, {
        toolName,
        index: toolIndex,
      })
      safeEmit('text:chunk:tool-call', {
        ...base,
        messageId: localMessageId || undefined,
        toolCallId: chunk.toolCallId,
        toolName,
        index: toolIndex,
        arguments: '',
        timestamp: Date.now(),
      })
    },
    TOOL_CALL_ARGS: (chunk: DevtoolsToolCallArgsChunk, base: ChunkBase) => {
      const active = activeToolCalls.get(chunk.toolCallId)
      safeEmit('text:chunk:tool-call', {
        ...base,
        messageId: localMessageId || undefined,
        toolCallId: chunk.toolCallId,
        toolName: active?.toolName ?? '',
        index: active?.index ?? 0,
        arguments: chunk.delta,
        timestamp: Date.now(),
      })
    },
    TOOL_CALL_END: (chunk: DevtoolsToolCallEndChunk) => {
      activeToolCalls.delete(chunk.toolCallId)
    },
    TOOL_CALL_RESULT: (chunk: DevtoolsToolCallResultChunk, base: ChunkBase) => {
      safeEmit('text:chunk:tool-result', {
        ...base,
        messageId: localMessageId || undefined,
        toolCallId: chunk.toolCallId,
        result: chunk.content || '',
        timestamp: Date.now(),
      })
    },
    RUN_FINISHED: (chunk: DevtoolsRunFinishedChunk, base: ChunkBase) =>
      emitRunFinished(chunk, base),
    RUN_ERROR: (chunk: DevtoolsRunErrorChunk, base: ChunkBase) => {
      const errorMessage =
        chunk.message ??
        `[ai-devtools] RUN_ERROR chunk had no message; raw chunk: ${JSON.stringify(chunk)}`
      safeEmit('text:chunk:error', {
        ...base,
        messageId: localMessageId || undefined,
        error: errorMessage,
        timestamp: Date.now(),
      })
    },
    REASONING_MESSAGE_CONTENT: (
      chunk: DevtoolsReasoningMessageContentChunk,
      base: ChunkBase,
    ) => {
      localAccumulatedThinking += chunk.delta
      safeEmit('text:chunk:thinking', {
        ...base,
        messageId: localMessageId || undefined,
        content: localAccumulatedThinking,
        delta: chunk.delta,
        timestamp: Date.now(),
      })
    },
  }

  function emitRunFinished(chunk: DevtoolsRunFinishedChunk, base: ChunkBase) {
    const rawUsage = chunk.usage
    const usage =
      rawUsage != null &&
      typeof rawUsage === 'object' &&
      !Array.isArray(rawUsage) &&
      'promptTokens' in rawUsage
        ? rawUsage
        : fromSpecTokenUsage(
            Array.isArray(rawUsage) ? rawUsage : undefined,
            chunkTanstack(chunk)?.usage,
          )
    safeEmit('text:chunk:done', {
      ...base,
      messageId: localMessageId || undefined,
      finishReason:
        chunk.finishReason ?? chunkTanstack(chunk)?.finishReason ?? null,
      usage,
      timestamp: Date.now(),
    })
    if (usage) {
      safeEmit('text:usage', {
        ...base,
        messageId: localMessageId || undefined,
        usage,
        timestamp: Date.now(),
      })
    }
  }

  return {
    name: 'devtools',

    onStart(ctx) {
      // Emit text:request:started
      safeEmit('text:request:started', {
        ...buildEventContext(ctx),
        timestamp: Date.now(),
      })

      // Emit text:message:created for initial messages
      const messages = ctx.messages
      const messagesToEmit = ctx.conversationId
        ? messages.slice(-1).filter((m) => m.role === 'user')
        : messages

      messagesToEmit.forEach((message, index) => {
        const messageIndex = ctx.conversationId ? messages.length - 1 : index
        const messageId = ctx.createId('msg')
        const base = buildEventContext(ctx)
        const content = getContentString(message.content)

        safeEmit('text:message:created', {
          ...base,
          messageId,
          role: message.role as 'user' | 'assistant' | 'system' | 'tool',
          content,
          toolCalls: message.toolCalls as never,
          messageIndex,
          timestamp: Date.now(),
        })

        if (message.role === 'user') {
          safeEmit('text:message:user', {
            ...base,
            messageId,
            role: 'user' as const,
            content,
            messageIndex,
            timestamp: Date.now(),
          })
        }
      })
    },

    onIteration(ctx: DevtoolsMiddlewareContext, info: DevtoolsIterationInfo) {
      const now = Date.now()

      // Emit completed for previous iteration (it ended with tool_calls if we got here)
      if (currentIteration >= 0) {
        safeEmit('text:iteration:completed', {
          ...buildEventContext(ctx),
          iteration: currentIteration,
          messageId: localMessageId || undefined,
          duration: now - iterationStartTime,
          finishReason: 'tool_calls',
          timestamp: now,
        })
      }

      // Track new iteration
      currentIteration = info.iteration
      iterationStartTime = now
      localMessageId = info.messageId
      localAccumulatedContent = ''
      localAccumulatedThinking = ''

      // Emit iteration:started with config snapshot
      safeEmit('text:iteration:started', {
        ...buildEventContext(ctx),
        iteration: info.iteration,
        messageId: info.messageId,
        timestamp: now,
      })

      // Emit assistant message placeholder
      safeEmit('text:message:created', {
        ...buildEventContext(ctx),
        messageId: info.messageId,
        role: 'assistant' as const,
        content: '',
        timestamp: now,
      })
    },

    onChunk(ctx, rawChunk) {
      if (!isKnownChunk(rawChunk)) return
      const base = buildEventContext(ctx)
      switch (rawChunk.type) {
        case 'TEXT_MESSAGE_CONTENT':
          chunkHandlers.TEXT_MESSAGE_CONTENT(rawChunk, base)
          return
        case 'TOOL_CALL_START':
          chunkHandlers.TOOL_CALL_START(rawChunk, base)
          return
        case 'TOOL_CALL_ARGS':
          chunkHandlers.TOOL_CALL_ARGS(rawChunk, base)
          return
        case 'TOOL_CALL_END':
          chunkHandlers.TOOL_CALL_END(rawChunk)
          return
        case 'TOOL_CALL_RESULT':
          chunkHandlers.TOOL_CALL_RESULT(rawChunk, base)
          return
        case 'RUN_FINISHED':
          chunkHandlers.RUN_FINISHED(rawChunk, base)
          return
        case 'RUN_ERROR':
          chunkHandlers.RUN_ERROR(rawChunk, base)
          return
        case 'REASONING_MESSAGE_CONTENT':
          chunkHandlers.REASONING_MESSAGE_CONTENT(rawChunk, base)
          return
      }
    },

    onToolPhaseComplete(ctx, info: DevtoolsToolPhaseCompleteInfo) {
      const base = buildEventContext(ctx)

      // Emit text:message:created for assistant message with tool calls
      if (info.toolCalls.length > 0) {
        safeEmit('text:message:created', {
          ...base,
          messageId: localMessageId ?? ctx.createId('msg'),
          role: 'assistant' as const,
          content: localAccumulatedContent || '',
          toolCalls: info.toolCalls as never,
          timestamp: Date.now(),
        })
      }

      // Emit tools:approval:requested for each pending approval
      for (const approval of info.needsApproval) {
        safeEmit('tools:approval:requested', {
          ...base,
          messageId: localMessageId || undefined,
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          input: approval.input,
          approvalId: approval.approvalId,
          timestamp: Date.now(),
        })
      }

      // Emit tools:input:available for each client tool
      for (const clientTool of info.needsClientExecution) {
        safeEmit('tools:input:available', {
          ...base,
          messageId: localMessageId || undefined,
          toolCallId: clientTool.toolCallId,
          toolName: clientTool.toolName,
          input: clientTool.input,
          timestamp: Date.now(),
        })
      }

      // Emit tools:call:completed and text:message:created (tool role) for each result
      for (const result of info.results) {
        safeEmit('tools:call:completed', {
          ...base,
          messageId: localMessageId || undefined,
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          result: result.result,
          duration: result.duration ?? 0,
          timestamp: Date.now(),
        })

        const content = JSON.stringify(result.result)
        safeEmit('text:message:created', {
          ...base,
          messageId: ctx.createId('msg'),
          role: 'tool' as const,
          content,
          timestamp: Date.now(),
        })
      }
    },

    onFinish(ctx, info) {
      const now = Date.now()

      // Emit completed for the final iteration
      if (currentIteration >= 0) {
        safeEmit('text:iteration:completed', {
          ...buildEventContext(ctx),
          iteration: currentIteration,
          messageId: localMessageId || undefined,
          duration: now - iterationStartTime,
          finishReason: info.finishReason || undefined,
          usage: info.usage,
          timestamp: now,
        })
      }

      safeEmit('text:request:completed', {
        ...buildEventContext(ctx),
        content: info.content,
        messageId: localMessageId || undefined,
        finishReason: info.finishReason || undefined,
        usage: info.usage,
        duration: info.duration,
        timestamp: now,
      })
    },
  }
}
