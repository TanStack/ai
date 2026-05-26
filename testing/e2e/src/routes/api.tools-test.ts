import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  EventType,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import {
  getToolsForScenario,
  type TestRuntimeContext,
} from '@/lib/tools-test-tools'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

const runtimeContextScenarios = new Set([
  'server-context',
  'client-context',
  'client-server-context',
])

function createRuntimeContextAdapter(scenario: string): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'runtime-context-test',
    model: 'runtime-context-test',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<StreamChunk> {
      const model = 'runtime-context-test'
      const runId = options.runId ?? 'runtime-context-run'
      const threadId = options.threadId ?? 'runtime-context-thread'
      const messageId = `${runId}-message`
      const hasToolResult = options.messages.some(
        (message) => message.role === 'tool',
      )

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
      }

      if (!hasToolResult) {
        const toolName =
          scenario === 'client-context'
            ? 'read_client_context'
            : 'read_server_context'
        const toolCallId = `${scenario}-tool-call`

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
          delta: 'Reading runtime context.',
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
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: toolName,
          toolName,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: '{}',
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId,
          toolCallName: toolName,
          toolName,
          input: {},
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model,
          finishReason: 'tool_calls',
          timestamp: Date.now(),
        }
        return
      }

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
        delta: 'Runtime context was read.',
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
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

export const Route = createFileRoute('/api/tools-test')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fp = params.forwardedProps as Record<string, unknown>
        const scenario =
          typeof fp.scenario === 'string' ? fp.scenario : 'text-only'
        const testId: string | undefined =
          typeof fp.testId === 'string' ? fp.testId : undefined
        const aimockPort: number | undefined =
          fp.aimockPort != null ? Number(fp.aimockPort) : undefined

        try {
          // Special error scenario: return a stream that immediately errors
          if (scenario === 'error') {
            const errorStream =
              (async function* (): AsyncGenerator<StreamChunk> {
                yield {
                  type: EventType.RUN_STARTED,
                  runId: 'error-test',
                  threadId: 'error-test',
                  timestamp: Date.now(),
                }
                yield {
                  type: EventType.RUN_ERROR,
                  message: 'Test error: Something went wrong during generation',
                  timestamp: Date.now(),
                }
              })()
            return toServerSentEventsResponse(errorStream, { abortController })
          }

          const adapterOptions = runtimeContextScenarios.has(scenario)
            ? { adapter: createRuntimeContextAdapter(scenario) }
            : createTextAdapter('openai', undefined, aimockPort, testId)

          const tools = getToolsForScenario(scenario)
          const runtimeContext: TestRuntimeContext =
            scenario === 'client-server-context' &&
            typeof fp.runtimeUserId === 'string'
              ? {
                  userId: fp.runtimeUserId,
                  tenantId: 'server-tenant-context',
                  source: 'forwarded-props',
                }
              : {
                  userId: 'server-user-context',
                  tenantId: 'server-tenant-context',
                  source: 'server-route',
                }

          const stream = chat({
            ...adapterOptions,
            messages: params.messages,
            tools,
            context: runtimeContext,
            threadId: params.threadId,
            runId: params.runId,
            agentLoopStrategy: maxIterations(20),
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          console.error('[Tools Test API] Error:', error)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
