import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenAI Responses adapter against a hand-crafted aimock mount
 * (`/openai-responses-usage`) whose `response.completed` usage reports
 * `input_tokens_details.cache_write_tokens`. The companion spec asserts it
 * reaches `RUN_FINISHED.usage` as `promptTokensDetails.cacheWriteTokens`.
 */
export const Route = createFileRoute('/api/openai-responses-usage')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createOpenaiChat('gpt-4o', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/openai-responses-usage/v1`,
        })

        let usage: Record<string, unknown> | undefined
        try {
          for await (const chunk of chat({
            threadId: 'openai-responses-usage',
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'hi' }],
          })) {
            if (chunk.type === 'RUN_FINISHED') {
              usage = chunk.usage as Record<string, unknown> | undefined
            }
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ ok: true, usage }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
