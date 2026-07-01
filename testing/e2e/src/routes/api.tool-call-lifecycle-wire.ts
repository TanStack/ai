import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import { z } from 'zod'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

/**
 * Wire-format regression for issue #519.
 *
 * Real adapters stream `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END`
 * for every tool call. Pre-fix, `chat()`'s post-execution phase pushed a
 * *second* `TOOL_CALL_END` (with no matching `START`) after running a
 * server tool, so the stream carried an orphan `END` that AG-UI-strict
 * consumers (`@ag-ui/client`'s `verifyEvents`) reject.
 *
 * The self-contained adapter below mirrors a real one: it streams its own
 * START/ARGS/END for the tool call, then a text answer once the tool result
 * comes back. The companion spec drains the emitted chunks and asserts the
 * lifecycle is balanced — exactly one END per tool call, each preceded by a
 * matching START.
 */
function createServerToolAdapter(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'tool-lifecycle-test',
    model: 'tool-lifecycle-test',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {},
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    async *chatStream(options): AsyncGenerator<StreamChunk> {
      const model = 'tool-lifecycle-test'
      const runId = options.runId ?? 'tool-lifecycle-run'
      const threadId = options.threadId ?? 'tool-lifecycle-thread'
      const messageId = `${runId}-message`
      const toolCallId = 'call_weather'
      const hasToolResult = options.messages.some((m) => m.role === 'tool')

      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: Date.now(),
      }

      // Second iteration: the tool ran, answer with text and finish.
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
          delta: 'It is 72F in NYC.',
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

      // First iteration: stream the full tool-call lifecycle, as a real
      // adapter does, then finish with `tool_calls`.
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'getWeather',
        toolName: 'getWeather',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: '{"city":"NYC"}',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolCallName: 'getWeather',
        toolName: 'getWeather',
        input: { city: 'NYC' },
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
  }
}

export const Route = createFileRoute('/api/tool-call-lifecycle-wire')({
  server: {
    handlers: {
      POST: async () => {
        const getWeather = toolDefinition({
          name: 'getWeather',
          description: 'Get the weather for a city',
          inputSchema: z.object({ city: z.string() }),
        }).server(async ({ city }) => ({ city, tempC: 22 }))

        const chunks: Array<unknown> = []
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter: createServerToolAdapter() }),
            tools: [getWeather],
            messages: [{ role: 'user', content: "What's the weather in NYC?" }],
            agentLoopStrategy: maxIterations(3),
          })) {
            chunks.push(chunk)
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              chunks,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ chunks, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
