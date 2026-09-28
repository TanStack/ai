import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenAI-compatible chat adapter against the
 * `/moonshot-usage-details` aimock mount, whose last chunk carries Moonshot's
 * usage shape (`cached_tokens` at the root, `cache_write_tokens` under
 * `prompt_tokens_details`). Returns `RUN_FINISHED.usage`.
 */
export const Route = createFileRoute('/api/moonshot-usage-details')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = openaiCompatibleText('kimi-k3', {
          baseURL: `${LLMOCK_DEFAULT_BASE}/moonshot-usage-details/v1`,
          apiKey: DUMMY_KEY,
        })

        let usage: Record<string, unknown> | undefined
        try {
          for await (const chunk of chat({
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
