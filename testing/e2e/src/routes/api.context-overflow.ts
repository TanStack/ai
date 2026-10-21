import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import {
  createOpenaiChat,
  createOpenaiChatCompletions,
} from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const config = { maxRetries: 0 }

const apis = {
  anthropic: {
    prompt: '[context-overflow-anthropic] say hello',
    adapter: () =>
      createAnthropicChat('claude-haiku-4-5', DUMMY_KEY, {
        ...config,
        baseURL: LLMOCK_DEFAULT_BASE,
      }),
  },
  'openai-responses': {
    prompt: '[context-overflow-openai] say hello',
    adapter: () =>
      createOpenaiChat('gpt-4o', DUMMY_KEY, {
        ...config,
        baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
      }),
  },
  'openai-chat-completions': {
    prompt: '[context-overflow-openai] say hello',
    adapter: () =>
      createOpenaiChatCompletions('gpt-4o', DUMMY_KEY, {
        ...config,
        baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
      }),
  },
}

/**
 * Streams one chat against the aimock fixtures in `fixtures/context-overflow`.
 * aimock answers with the provider's context overflow error. Returns the
 * `code` and `message` of the `RUN_ERROR` that `chat()` yields. `?api=` picks
 * the adapter.
 */
export const Route = createFileRoute('/api/context-overflow')({
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

        let runError: { code?: string; message: string } | undefined
        try {
          for await (const chunk of chat({
            threadId: 'context-overflow',
            adapter: apis[api].adapter(),
            messages: [{ role: 'user', content: apis[api].prompt }],
          })) {
            if (chunk.type === 'RUN_ERROR') {
              runError = { code: chunk.code, message: chunk.message }
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
