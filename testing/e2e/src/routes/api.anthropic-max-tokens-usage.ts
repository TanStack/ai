import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Streams one Anthropic chat that stops at `max_tokens`, against the aimock
 * fixture in `fixtures/max-tokens-usage`. aimock sends the input count on
 * `message_start` and only `output_tokens` on the closing `message_delta`.
 * Returns the `RUN_ERROR` that `chat()` yields (issue #1597).
 */
export const Route = createFileRoute('/api/anthropic-max-tokens-usage')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createAnthropicChat('claude-haiku-4-5', DUMMY_KEY, {
          baseURL: LLMOCK_DEFAULT_BASE,
        })

        let runError: Record<string, unknown> | undefined
        try {
          for await (const chunk of chat({
            adapter,
            modelOptions: { max_tokens: 3 },
            messages: [
              {
                role: 'user',
                content: '[max-tokens-usage] say hello in five words',
              },
            ],
          })) {
            if (chunk.type === 'RUN_ERROR') {
              runError = { code: chunk.code, usage: chunk.usage }
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
