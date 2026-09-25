import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  createChatOptions,
  maxIterations,
  toolDefinition,
} from '@tanstack/ai'
import { createMistralText } from '@tanstack/ai-mistral'
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
  const args = JSON.stringify({
    mode: null,
    question: 'Which option?',
    options: null,
    nullableNote: null,
  })
  return makeEventStream([
    {
      id: 'cmpl-tool',
      model: 'mistral-large-latest',
      object: 'chat.completion.chunk',
      created: 0,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'call-tool',
                type: 'function',
                function: {
                  name: 'ask_user',
                  arguments: args,
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'cmpl-tool',
      model: 'mistral-large-latest',
      object: 'chat.completion.chunk',
      created: 0,
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    },
  ])
}

function makeTextStream(): ReadableStream<Uint8Array> {
  return makeEventStream([
    {
      id: 'cmpl-text',
      model: 'mistral-large-latest',
      object: 'chat.completion.chunk',
      created: 0,
      choices: [
        {
          index: 0,
          delta: { content: 'Tool executed.' },
          finish_reason: null,
        },
      ],
    },
    {
      id: 'cmpl-text',
      model: 'mistral-large-latest',
      object: 'chat.completion.chunk',
      created: 0,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 2,
        total_tokens: 10,
      },
    },
  ])
}

export const Route = createFileRoute('/api/mistral-strict-tool-null-wire')({
  server: {
    handlers: {
      POST: async () => {
        let requestCount = 0
        let firstRequestBody: unknown
        let executedInput: unknown
        const originalFetch = globalThis.fetch

        globalThis.fetch = (async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init)
          if (!request.url.includes('/v1/chat/completions')) {
            return originalFetch(input, init)
          }

          requestCount++
          if (requestCount === 1) {
            firstRequestBody = JSON.parse(await request.text())
          }

          return new Response(
            requestCount === 1 ? makeToolCallStream() : makeTextStream(),
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        }) as typeof fetch

        try {
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
          const adapter = createMistralText('mistral-large-latest', DUMMY_KEY)
          const text: Array<string> = []

          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'Ask me a question' }],
            tools: [askUser],
            agentLoopStrategy: maxIterations(3),
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text.push(chunk.delta)
          }

          return Response.json({
            ok: true,
            requestCount,
            firstRequestBody,
            executedInput,
            text: text.join(''),
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          globalThis.fetch = originalFetch
        }
      },
    },
  },
})
