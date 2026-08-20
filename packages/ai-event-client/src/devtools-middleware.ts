import { aiEventClient } from './index.js'
import type { TokenUsage } from './index.js'

// Local mirrors of @tanstack/ai middleware types — do not import from `@tanstack/ai`
// here: during `@tanstack/ai`'s own build that resolves to `dist/*.d.ts` while the
// engine compiles from `src/`, producing incompatible duplicate types.

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
  usage?: Array<DevtoolsSpecTokenUsage>
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

// The engine emits more chunk types than this middleware acts on
// (TEXT_MESSAGE_START, MESSAGES_SNAPSHOT, REASONING_*, CUSTOM, etc.); the
// onChunk signature accepts the open shape, and isKnownChunk narrows to the
// closed discriminated union before the switch.
type DevtoolsStreamChunk = { type: string } & Record<string, unknown>

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

function isKnownChunk(chunk: DevtoolsStreamChunk): boolean {
  return (KNOWN_CHUNK_TYPES as ReadonlySet<string>).has(chunk.type)
}

function chunkTanstack(chunk: DevtoolsRunFinishedChunk) {
  const tanstack = chunk.metadata?.tanstack
  if (tanstack == null || typeof tanstack !== 'object') return undefined
  return tanstack
}

function definedDetails<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined
}

// Local copy of `@tanstack/ai`'s fromSpecTokenUsage. This package cannot
// import `@tanstack/ai` (circular: the engine injects this middleware).
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

// Observation-only middleware returned by {@link devtoolsMiddleware}.
// Structurally compatible with `ChatMiddleware` from `@tanstack/ai`.
export interface DevtoolsChatMiddleware {
  name?: string
  onStart?: (ctx: DevtoolsMiddlewareContext) => void | Promise<void>
  onIteration?: (
    ctx: DevtoolsMiddlewareContext,
    info: DevtoolsIterationInfo,
  ) => void | Promise<void>
  onChunk?: (
    ctx: DevtoolsMiddlewareContext,
    chunk: DevtoolsStreamChunk,
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

// Wrap an emit so a misbehaving subscriber cannot bubble into the host chat
// engine. Instrumentation must never break the host app.
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
    // Devtools wire payload is plain strings; per-prompt metadata is
    // irrelevant for observation and would require devtools-UI changes to
    // render. Project metadata away here so the wire shape is unchanged.
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
      const chunk = rawChunk as DevtoolsKnownChunk
      const base = buildEventContext(ctx)

      switch (chunk.type) {
        case 'TEXT_MESSAGE_CONTENT': {
          localAccumulatedContent += chunk.delta
          safeEmit('text:chunk:content', {
            ...base,
            messageId: localMessageId || undefined,
            content: localAccumulatedContent,
            delta: chunk.delta,
            timestamp: Date.now(),
          })
          break
        }
        case 'TOOL_CALL_START': {
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
          break
        }
        case 'TOOL_CALL_ARGS': {
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
          break
        }
        case 'TOOL_CALL_END': {
          activeToolCalls.delete(chunk.toolCallId)
          break
        }
        case 'TOOL_CALL_RESULT': {
          // Server-executed tool results arrive on the spec-compliant
          // TOOL_CALL_RESULT event (the adapter's TOOL_CALL_END carries only
          // the parsed input). Surface them to devtools from here so results
          // still show up now that the post-execution END is no longer
          // re-emitted (#519).
          safeEmit('text:chunk:tool-result', {
            ...base,
            messageId: localMessageId || undefined,
            toolCallId: chunk.toolCallId,
            result: chunk.content || '',
            timestamp: Date.now(),
          })
          break
        }
        case 'RUN_FINISHED': {
          const usage = fromSpecTokenUsage(
            chunk.usage,
            chunkTanstack(chunk)?.usage,
          )
          safeEmit('text:chunk:done', {
            ...base,
            messageId: localMessageId || undefined,
            finishReason: chunkTanstack(chunk)?.finishReason ?? null,
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
          break
        }
        case 'RUN_ERROR': {
          const errorMessage =
            chunk.message ??
            `[ai-devtools] RUN_ERROR chunk had no message; raw chunk: ${JSON.stringify(chunk)}`
          safeEmit('text:chunk:error', {
            ...base,
            messageId: localMessageId || undefined,
            error: errorMessage,
            timestamp: Date.now(),
          })
          break
        }
        case 'REASONING_MESSAGE_CONTENT': {
          localAccumulatedThinking += chunk.delta
          safeEmit('text:chunk:thinking', {
            ...base,
            messageId: localMessageId || undefined,
            content: localAccumulatedThinking,
            delta: chunk.delta,
            timestamp: Date.now(),
          })
          break
        }
      }

      // Return void — observation only, pass through unchanged
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
