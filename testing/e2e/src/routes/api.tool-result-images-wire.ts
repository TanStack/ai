import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import {
  createOpenRouterResponsesText,
  createOpenRouterText,
} from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import type { ModelMessage } from '@tanstack/ai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/** A history whose tool result has text and an image. */
const messages: Array<ModelMessage> = [
  { role: 'user', content: 'Take a screenshot.' },
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call_screenshot',
        type: 'function',
        function: { name: 'get_screenshot', arguments: '{}' },
      },
    ],
  },
  {
    role: 'tool',
    toolCallId: 'call_screenshot',
    content: [
      { type: 'text', content: 'Layout screenshot' },
      {
        type: 'image',
        source: { type: 'data', value: 'AAAA', mimeType: 'image/png' },
      },
    ],
  },
]

/**
 * Sends the history above through one adapter and returns the request body.
 * The provider answers 400, so the run stops after one request.
 */
export const Route = createFileRoute('/api/tool-result-images-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = new URL(request.url).searchParams.get('api')
        let body: unknown
        const fetcher = async (
          input: string | URL | Request,
          init?: RequestInit,
        ) => {
          body = JSON.parse(
            input instanceof Request
              ? await input.clone().text()
              : String(init?.body),
          )
          return Response.json({ error: { message: 'stop' } }, { status: 400 })
        }
        const httpClient = new HTTPClient({ fetcher })
        const adapter =
          api === 'openai-chat'
            ? createOpenaiChatCompletions('gpt-5.5', DUMMY_KEY, {
                maxRetries: 0,
                fetch: fetcher,
              })
            : api === 'openrouter-responses'
              ? createOpenRouterResponsesText('openai/gpt-5.5', DUMMY_KEY, {
                  httpClient,
                })
              : createOpenRouterText('openai/gpt-5.5', DUMMY_KEY, {
                  httpClient,
                })
        try {
          for await (const _ of chat({ adapter, messages, debug: false })) {
            // Drain the stream.
          }
        } catch {
          // The 400 ends the run. Only the request body matters.
        }
        return Response.json({ body })
      },
    },
  },
})
