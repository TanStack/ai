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

function makeToolCallStream(): ReadableStream<Uint8Array> {
  const responseId = 'resp_strict_tool_null'
  const itemId = 'call_strict_tool_null'
  const args = JSON.stringify({
    mode: null,
    question: 'Which option?',
    options: null,
    nullableNote: null,
  })
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
      item: {
        id: itemId,
        call_id: itemId,
        type: 'function_call',
        name: 'ask_user',
        arguments: '',
        status: 'in_progress',
      },
    },
    {
      type: 'response.function_call_arguments.delta',
      response_id: responseId,
      item_id: itemId,
      output_index: 0,
      delta: args,
    },
    {
      type: 'response.function_call_arguments.done',
      response_id: responseId,
      item_id: itemId,
      output_index: 0,
      arguments: args,
    },
    {
      type: 'response.output_item.done',
      response_id: responseId,
      output_index: 0,
      item: {
        id: itemId,
        call_id: itemId,
        type: 'function_call',
        name: 'ask_user',
        arguments: args,
        status: 'completed',
      },
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
            call_id: itemId,
            type: 'function_call',
            name: 'ask_user',
            arguments: args,
            status: 'completed',
          },
        ],
        usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      },
    },
  ])
}

function makeTextStream(): ReadableStream<Uint8Array> {
  const responseId = 'resp_strict_tool_text'
  const itemId = 'msg_strict_tool_text'
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
      delta: 'Tool executed.',
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
            content: [{ type: 'output_text', text: 'Tool executed.' }],
          },
        ],
        usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 },
      },
    },
  ])
}

export const Route = createFileRoute('/api/openai-strict-tool-null-wire')({
  server: {
    handlers: {
      POST: async () => {
        let requestCount = 0
        let firstRequestBody: unknown
        let executedInput: unknown

        const mockFetch: typeof fetch = async (input, init) => {
          requestCount++
          const request =
            input instanceof Request ? input : new Request(input, init)
          if (requestCount === 1) {
            firstRequestBody = JSON.parse(await request.text())
          }

          return new Response(
            requestCount === 1 ? makeToolCallStream() : makeTextStream(),
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        }

        const askUser = toolDefinition({
          name: 'ask_user',
          description: 'Ask the user to choose an option',
          inputSchema: z.object({
            mode: z.enum(['canary']).optional(),
            question: z.string(),
            options: z.array(z.string()).optional(),
            nullableNote: z.string().nullable(),
          }),
        }).server((input) => {
          executedInput = input
          return { accepted: true }
        })
        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          fetch: mockFetch,
        })
        const text: Array<string> = []

        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Ask me a question' }],
            tools: [askUser],
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
