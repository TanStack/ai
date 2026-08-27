import { aiEventClient } from './index.js'
import type { TokenUsage } from './index.js'

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
  const chunkHandlers: Record<
    string,
    (chunk: DevtoolsKnownChunk, base: ChunkBase) => void
  > = {
    TEXT_MESSAGE_CONTENT: (chunk, base) => {
      localAccumulatedContent += chunk.delta
      safeEmit('text:chunk:content', {
        ...base,
        messageId: localMessageId || undefined,
        content: localAccumulatedContent,
        delta: chunk.delta,
        timestamp: Date.now(),
      })
    },
    TOOL_CALL_START: (chunk, base) => {
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
    TOOL_CALL_ARGS: (chunk, base) => {
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
    TOOL_CALL_END: (chunk) => {
      activeToolCalls.delete(chunk.toolCallId)
    },
    TOOL_CALL_RESULT: (chunk, base) => {
      safeEmit('text:chunk:tool-result', {
        ...base,
        messageId: localMessageId || undefined,
        toolCallId: chunk.toolCallId,
        result: chunk.content || '',
        timestamp: Date.now(),
      })
    },
    RUN_FINISHED: (chunk, base) => emitRunFinished(chunk, base),
    RUN_ERROR: (chunk, base) => {
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
    REASONING_MESSAGE_CONTENT: (chunk, base) => {
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
      const chunk = rawChunk
      const base = buildEventContext(ctx)
      const handler = chunkHandlers[chunk.type]
      if (handler) handler(chunk, base)
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
