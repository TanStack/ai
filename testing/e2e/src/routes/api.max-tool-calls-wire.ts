import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import { z } from 'zod'
import type { AnyTextAdapter, ChatMiddleware, StreamChunk } from '@tanstack/ai'

/**
 * Wire-format regression for issue #964.
 *
 * `maxIterations` counts model turns, not tool calls. A single turn can emit
 * unbounded parallel tool calls. This route emits a fat parallel turn (8
 * calls) and asserts an app-owned tool-budget middleware can:
 *  1. Cap how many execute per turn (`onBeforeToolCall` skip)
 *  2. Stop further model turns once cumulative emitted tools hit a budget
 *     (`onShouldContinue`)
 *  3. Still emit error tool results for skipped calls (history stays consistent)
 *
 * The budget middleware is the docs recipe — not a library export.
 */
function toolCallBudget(options: {
  max?: number
  maxPerTurn?: number
}): ChatMiddleware {
  const { max, maxPerTurn } = options
  let perTurn = 0
  return {
    name: 'tool-call-budget',
    onIteration() {
      perTurn = 0
    },
    onToolPhaseComplete() {
      perTurn = 0
    },
    onBeforeToolCall() {
      if (maxPerTurn == null) return undefined
      perTurn += 1
      if (perTurn > maxPerTurn) {
        return {
          type: 'skip' as const,
          result: {
            error: `Skipped: exceeded maxToolCallsPerTurn (${maxPerTurn})`,
          },
        }
      }
      return undefined
    },
    onShouldContinue(_ctx, state) {
      if (max != null && state.toolCallCount >= max) return false
      return undefined
    },
  }
}

function createFatParallelAdapter(callCount: number): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'max-tool-calls-test',
    model: 'max-tool-calls-test',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<StreamChunk> {
      const model = 'max-tool-calls-test'
      const runId = options.runId ?? 'max-tool-calls-run'
      const threadId = options.threadId ?? 'max-tool-calls-thread'
      const messageId = `${runId}-message`
      const hasToolResult = options.messages.some((m) => m.role === 'tool')

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
      }

      // Later iterations: answer with text once any tool results are present.
      if (hasToolResult) {
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: 'done',
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model,
          finishReason: 'stop',
          timestamp: Date.now(),
        }
        return
      }

      // First iteration: emit many parallel tool calls in one turn.
      for (let i = 0; i < callCount; i++) {
        const toolCallId = `call_${i}`
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: 'ping',
          toolName: 'ping',
          index: i,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: `{"n":${i}}`,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId,
          toolCallName: 'ping',
          toolName: 'ping',
          input: { n: i },
          model,
          timestamp: Date.now(),
        }
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        finishReason: 'tool_calls',
        timestamp: Date.now(),
      }
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

export const Route = createFileRoute('/api/max-tool-calls-wire')({
  server: {
    handlers: {
      POST: async () => {
        let executeCount = 0
        const ping = toolDefinition({
          name: 'ping',
          description: 'Ping tool for fan-out budget tests',
          inputSchema: z.object({ n: z.number() }),
        }).server(async ({ n }) => {
          executeCount++
          return { n, ok: true }
        })

        const chunks: Array<unknown> = []
        let error: string | null = null
        try {
          for await (const chunk of chat({
            ...createChatOptions({
              adapter: createFatParallelAdapter(8),
            }),
            tools: [ping],
            messages: [{ role: 'user', content: 'Call ping many times' }],
            // maxIterations high enough that only middleware can stop the loop
            agentLoopStrategy: maxIterations(10),
            middleware: [
              toolCallBudget({
                maxPerTurn: 3,
                max: 5,
              }),
            ],
          })) {
            chunks.push(chunk)
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err)
        }

        return new Response(
          JSON.stringify({
            chunks,
            error,
            executeCount,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
