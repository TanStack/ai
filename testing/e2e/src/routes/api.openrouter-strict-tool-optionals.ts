import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import {
  createOpenRouterResponsesText,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import { z } from 'zod'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

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

function makeChatTextStream(): ReadableStream<Uint8Array> {
  return makeEventStream([
    {
      id: 'chatcmpl-strict-optionals',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'openai/gpt-5.2',
      choices: [
        {
          index: 0,
          delta: { content: 'Tool executed.' },
          finish_reason: 'stop',
        },
      ],
    },
  ])
}

// The strict wire schema made `strings` required + nullable, so the model
// sends `null` for the omitted optional.
function makeResponsesToolCallStream(): ReadableStream<Uint8Array> {
  const responseId = 'resp_strict_optionals'
  const itemId = 'call_strict_optionals'
  const args = JSON.stringify({ guitar: 'Martin D-28', strings: null })
  const item = {
    id: itemId,
    call_id: itemId,
    type: 'function_call',
    name: 'recommend_guitar',
    arguments: args,
    status: 'completed',
  }
  return makeEventStream([
    {
      type: 'response.created',
      sequence_number: 0,
      response: {
        id: responseId,
        object: 'response',
        model: 'openai/gpt-5.2',
        status: 'in_progress',
        output: [],
      },
    },
    {
      type: 'response.output_item.added',
      sequence_number: 1,
      output_index: 0,
      item: { ...item, arguments: '', status: 'in_progress' },
    },
    {
      type: 'response.function_call_arguments.done',
      sequence_number: 2,
      item_id: itemId,
      output_index: 0,
      arguments: args,
    },
    {
      type: 'response.completed',
      sequence_number: 3,
      response: {
        id: responseId,
        object: 'response',
        model: 'openai/gpt-5.2',
        status: 'completed',
        output: [item],
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      },
    },
  ])
}

function makeResponsesTextStream(): ReadableStream<Uint8Array> {
  const responseId = 'resp_strict_optionals_text'
  const itemId = 'msg_strict_optionals_text'
  return makeEventStream([
    {
      type: 'response.created',
      sequence_number: 0,
      response: {
        id: responseId,
        object: 'response',
        model: 'openai/gpt-5.2',
        status: 'in_progress',
        output: [],
      },
    },
    {
      type: 'response.output_text.delta',
      sequence_number: 1,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: 'Tool executed.',
    },
    {
      type: 'response.completed',
      sequence_number: 2,
      response: {
        id: responseId,
        object: 'response',
        model: 'openai/gpt-5.2',
        status: 'completed',
        output: [
          {
            id: itemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Tool executed.' }],
          },
        ],
        usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 },
      },
    },
  ])
}

/**
 * Drives both OpenRouter text adapters with a tool that has an optional
 * field. Chat Completions must send `strict: false`: OpenRouter serves OpenAI
 * models through the upstream Responses API, where an omitted `strict` forces
 * every optional field. The Responses adapter sends a strict, null-widened
 * schema and must strip the synthesized `null` before the tool runs.
 */
export const Route = createFileRoute('/api/openrouter-strict-tool-optionals')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = new URL(request.url).searchParams.get('api')
        let requestCount = 0
        let firstRequestBody: unknown
        let executedInput: unknown

        const httpClient = new HTTPClient({
          fetcher: async (input, init) => {
            requestCount++
            const req =
              input instanceof Request ? input : new Request(input, init)
            if (requestCount === 1) {
              firstRequestBody = JSON.parse(await req.text())
            }
            const body =
              api === 'responses'
                ? requestCount === 1
                  ? makeResponsesToolCallStream()
                  : makeResponsesTextStream()
                : makeChatTextStream()
            return new Response(body, {
              headers: { 'Content-Type': 'text/event-stream' },
            })
          },
        })

        const recommendGuitar = toolDefinition({
          name: 'recommend_guitar',
          description: 'Recommend a guitar',
          inputSchema: z.object({
            guitar: z.string(),
            strings: z
              .object({ gauges: z.array(z.string()).min(1) })
              .optional(),
          }),
        }).server((input) => {
          executedInput = input
          return { accepted: true }
        })

        const config = {
          serverURL: 'http://openrouter.test/api/v1',
          httpClient,
        }
        const adapter =
          api === 'responses'
            ? createOpenRouterResponsesText('openai/gpt-5.2', DUMMY_KEY, config)
            : createOpenRouterText('openai/gpt-5.2', DUMMY_KEY, config)
        const text: Array<string> = []

        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Hello' }],
            tools: [recommendGuitar],
            agentLoopStrategy: maxIterations(3),
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text.push(chunk.delta)
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
          firstRequestBody,
          executedInput,
          text: text.join(''),
        })
      },
    },
  },
})
