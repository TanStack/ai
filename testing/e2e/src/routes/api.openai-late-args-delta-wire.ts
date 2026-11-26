import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { z } from 'zod'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

type Completion = 'arguments-done' | 'item-done'

function makeEventStream(events: Array<unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}

/**
 * A complete `get_weather` call, then one more arguments delta for the same
 * item after the call already completed (via `function_call_arguments.done`
 * or `output_item.done`). The late delta must not reach the finalized
 * arguments.
 */
function makeToolCallStream(completion: Completion) {
  const responseId = 'resp_late_args_delta'
  const itemId = 'call_late_args_delta'
  const args = JSON.stringify({ city: 'Paris' })
  const item = {
    id: itemId,
    call_id: itemId,
    type: 'function_call',
    name: 'get_weather',
    arguments: args,
    status: 'completed',
  }
  const argumentsDone = {
    type: 'response.function_call_arguments.done',
    response_id: responseId,
    item_id: itemId,
    output_index: 0,
    arguments: args,
  }
  const itemDone = {
    type: 'response.output_item.done',
    response_id: responseId,
    output_index: 0,
    item,
  }
  const lateDelta = {
    type: 'response.function_call_arguments.delta',
    response_id: responseId,
    item_id: itemId,
    output_index: 0,
    delta: '}',
  }
  return makeEventStream([
    {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        model: 'gpt-5.2',
        status: 'in_progress',
        output: [],
      },
    },
    {
      type: 'response.output_item.added',
      response_id: responseId,
      output_index: 0,
      item: { ...item, arguments: '', status: 'in_progress' },
    },
    {
      type: 'response.function_call_arguments.delta',
      response_id: responseId,
      item_id: itemId,
      output_index: 0,
      delta: args,
    },
    ...(completion === 'arguments-done'
      ? [argumentsDone, lateDelta, itemDone]
      : [itemDone, lateDelta]),
    {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        model: 'gpt-5.2',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      },
    },
  ])
}

function makeTextStream() {
  const responseId = 'resp_late_args_text'
  const itemId = 'msg_late_args_text'
  return makeEventStream([
    {
      type: 'response.created',
      response: {
        id: responseId,
        object: 'response',
        model: 'gpt-5.2',
        status: 'in_progress',
        output: [],
      },
    },
    {
      type: 'response.output_text.delta',
      response_id: responseId,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: 'Sunny in Paris.',
    },
    {
      type: 'response.completed',
      response: {
        id: responseId,
        object: 'response',
        model: 'gpt-5.2',
        status: 'completed',
        output: [
          {
            id: itemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Sunny in Paris.' }],
          },
        ],
        usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
      },
    },
  ])
}

export const Route = createFileRoute('/api/openai-late-args-delta-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => ({}))
        const completion: Completion =
          typeof body === 'object' &&
          body !== null &&
          'completion' in body &&
          body.completion === 'item-done'
            ? 'item-done'
            : 'arguments-done'
        let requestCount = 0
        const executedInputs: Array<unknown> = []
        const toolErrors: Array<string> = []
        const text: Array<string> = []

        const mockFetch: typeof fetch = () => {
          requestCount++
          return Promise.resolve(
            new Response(
              requestCount === 1
                ? makeToolCallStream(completion)
                : makeTextStream(),
              { headers: { 'Content-Type': 'text/event-stream' } },
            ),
          )
        }

        const getWeather = toolDefinition({
          name: 'get_weather',
          description: 'Get the weather for a city',
          inputSchema: z.object({ city: z.string() }),
        }).server((input) => {
          executedInputs.push(input)
          return { forecast: 'sunny' }
        })
        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          fetch: mockFetch,
        })

        try {
          for await (const chunk of chat({
            threadId: 'openai-late-args-delta-wire',
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Weather in Paris?' }],
            tools: [getWeather],
            agentLoopStrategy: maxIterations(3),
            debug: false,
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text.push(chunk.delta)
            if (
              chunk.type === 'TOOL_CALL_RESULT' &&
              typeof chunk.content === 'string' &&
              chunk.content.toLowerCase().includes('error')
            ) {
              toolErrors.push(chunk.content)
            }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({
          ok: true,
          requestCount,
          executedInputs,
          toolErrors,
          text: text.join(''),
        })
      },
    },
  },
})
