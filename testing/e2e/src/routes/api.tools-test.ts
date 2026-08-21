import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { AnyTextAdapter, AdapterYieldChunk } from '@tanstack/ai'
import type { TestRuntimeContext } from '@/lib/tools-test-tools'
import { createTextAdapter } from '@/lib/providers'
import { getToolsForScenario } from '@/lib/tools-test-tools'

const providerFreeScenarios = new Set([
  'server-context',
  'client-context',
  'client-server-context',
  'malformed-tool-arguments',
  'provider-rejected-tool-call',
])

function createProviderFreeAdapter(scenario: string): AnyTextAdapter {
  const config =
    scenario === 'provider-rejected-tool-call'
      ? {
          arguments: '{"component":"database","unexpected":true}',
          initialText: 'Checking system status.',
          input: { component: 'database', unexpected: true },
          name: 'provider-rejected-tool-call-test',
          responseText: 'Recovered from provider-rejected tool call.',
          result: JSON.stringify({ error: 'Provider rejected tool call' }),
          state: 'output-error' as const,
          toolName: 'check_status',
        }
      : scenario === 'malformed-tool-arguments'
        ? {
            arguments: '{',
            initialText: 'Checking system status.',
            input: undefined,
            name: 'malformed-tool-arguments-test',
            responseText: 'Recovered from malformed tool arguments.',
            result: undefined,
            state: undefined,
            toolName: 'check_status',
          }
        : {
            arguments: '{}',
            initialText: 'Reading runtime context.',
            input: {},
            name: 'runtime-context-test',
            responseText: 'Runtime context was read.',
            result: undefined,
            state: undefined,
            toolName:
              scenario === 'client-context'
                ? 'read_client_context'
                : 'read_server_context',
          }
  return {
    kind: 'text',
    name: config.name,
    model: config.name,
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<AdapterYieldChunk> {
      const model = config.name
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
          delta: config.initialText,
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
          toolCallName: config.toolName,
          toolName: config.toolName,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: config.arguments,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId,
          toolCallName: config.toolName,
          toolName: config.toolName,
          ...(config.input === undefined ? {} : { input: config.input }),
          ...(config.result === undefined
            ? {}
            : { result: config.result, state: config.state }),
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
        delta: config.responseText,
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

/**
 * Regression adapter for issue #1017.
 *
 * Emits a TEXT_MESSAGE_CONTENT delta between two TOOL_CALL_ARGS deltas.
 * Pre-fix, the interleaved text force-completed the tool call with a
 * lenient partial-JSON parse of the truncated arguments
 * (`{"city":"New Yo"}`) and the later TOOL_CALL_END was skipped.
 */
function createInterleavedArgsAdapter(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'interleaved-args-test',
    model: 'interleaved-args-test',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<AdapterYieldChunk> {
      const model = 'interleaved-args-test'
      const runId = options.runId ?? 'interleaved-args-run'
      const threadId = options.threadId ?? 'interleaved-args-thread'
      const messageId = `${runId}-message`
      const toolCallId = 'interleaved-args-tool-call'
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
          delta: 'It is 72F in New York City.',
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

      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'get_weather',
        toolName: 'get_weather',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: '{"city":"New Yo',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: 'Let me check the weather. ',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: 'rk City"}',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: 'get_weather',
        toolName: 'get_weather',
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

        const fp = params.forwardedProps
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
              (async function* (): AsyncGenerator<AdapterYieldChunk> {
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
                  code: 'provider_error',
                  // Mirrors a provider's structured error body forwarded by the
                  // adapters as `rawEvent`. Asserts it survives SSE transport,
                  // the strip-to-spec middleware, and reaches the consumer.
                  rawEvent: {
                    provider_name: 'test-provider',
                    raw: { reason: 'upstream overloaded' },
                  },
                }
              })()
            return toServerSentEventsResponse(errorStream, { abortController })
          }

          const adapterOptions =
            scenario === 'interleaved-args'
              ? { adapter: createInterleavedArgsAdapter() }
              : providerFreeScenarios.has(scenario)
                ? { adapter: createProviderFreeAdapter(scenario) }
                : createTextAdapter(
                    'openai',
                    scenario === 'client-tool-reasoning'
                      ? 'gpt-5.2'
                      : undefined,
                    aimockPort,
                    testId,
                  )

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
            ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
            ...(params.resume ? { resume: params.resume } : {}),
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
