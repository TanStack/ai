import { createFileRoute } from '@tanstack/react-router'
import { createOpenAI } from '@ai-sdk/openai'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
  validateUIMessages,
} from 'ai'
import { z } from 'zod'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

// An AI SDK `streamText` route that TanStack `useChat` reads through
// `fromChatTransport`. The model is aimock's OpenAI chat completions API.
// The user message `[ai-sdk-data]` skips the model: the route writes the same
// `data-search` part twice, with one id.
export const Route = createFileRoute('/api/ai-sdk-server')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: { messages: unknown } = await request.json()
        const messages = await validateUIMessages({ messages: body.messages })

        if (JSON.stringify(messages).includes('[ai-sdk-data]')) {
          return createUIMessageStreamResponse({
            stream: createUIMessageStream({
              execute({ writer }) {
                const id = 'search-1'
                writer.write({
                  type: 'data-search',
                  id,
                  data: { status: 'running' },
                })
                writer.write({
                  type: 'data-search',
                  id,
                  data: { status: 'done', hits: 3 },
                })
                writer.write({ type: 'text-start', id: 't' })
                writer.write({ type: 'text-delta', id: 't', delta: 'Found 3.' })
                writer.write({ type: 'text-end', id: 't' })
              },
            }),
          })
        }

        const openai = createOpenAI({
          apiKey: 'sk-e2e-test-dummy-key',
          baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
        })
        return streamText({
          model: openai.chat('gpt-4o'),
          messages: await convertToModelMessages(messages),
          tools: {
            addToCart: tool({
              description: 'Add a guitar to the cart',
              inputSchema: z.object({
                guitarId: z.string(),
                quantity: z.number(),
              }),
              needsApproval: true,
              execute: ({ guitarId }) => ({ added: guitarId }),
            }),
          },
        }).toUIMessageStreamResponse()
      },
    },
  },
})
