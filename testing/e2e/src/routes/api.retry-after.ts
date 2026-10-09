import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createOpenaiChat,
  createOpenaiChatCompletions,
} from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'
// The SDKs must not retry the 429 themselves.
const config = { maxRetries: 0 }

const adapters = {
  anthropic: () =>
    createAnthropicChat('claude-haiku-4-5', DUMMY_KEY, {
      ...config,
      baseURL: LLMOCK_DEFAULT_BASE,
    }),
  'openai-responses': () =>
    createOpenaiChat('gpt-4o', DUMMY_KEY, {
      ...config,
      baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
    }),
  'openai-chat-completions': () =>
    createOpenaiChatCompletions('gpt-4o', DUMMY_KEY, {
      ...config,
      baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
    }),
}

/**
 * Streams one chat against the aimock fixture in `fixtures/retry-after`. aimock
 * answers with a 429 and `Retry-After: 7`. Returns the `retryAfterMs` of the
 * `RUN_ERROR` that `chat()` yields. `?api=` picks the adapter.
 */
export const Route = createFileRoute('/api/retry-after')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = new URL(request.url).searchParams.get('api')
        if (
          api !== 'anthropic' &&
          api !== 'openai-responses' &&
          api !== 'openai-chat-completions'
        ) {
          return Response.json({ ok: false, error: `Unknown api: ${api}` })
        }

        let runError: Record<string, unknown> | undefined
        try {
          for await (const chunk of chat({
            adapter: adapters[api](),
            messages: [{ role: 'user', content: '[retry-after] say hello' }],
          })) {
            if (chunk.type === 'RUN_ERROR') {
              runError = {
                message: chunk.message,
                retryAfterMs: chunk.metadata?.tanstack?.retryAfterMs,
              }
            }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, runError })
      },
    },
  },
})
