import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenRouter chat-completions adapter against a hand-crafted aimock
 * mount (`/openrouter-cost`) whose stream ends with a usage-only chunk carrying
 * `cost` / `cost_details`. The companion spec asserts that those values reach
 * `RUN_FINISHED.usage` — proving the adapter forwards OpenRouter's
 * provider-reported per-request cost.
 */
export const Route = createFileRoute('/api/openrouter-cost')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createOpenRouterText('openai/gpt-4o', DUMMY_KEY, {
          serverURL: `${LLMOCK_DEFAULT_BASE}/openrouter-cost/v1`,
        })

        let usage: Record<string, unknown> | undefined
        let generationId: string | undefined
        let provider: string | undefined
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'hi' }],
          })) {
            if (chunk.type === 'RUN_FINISHED') {
              usage = chunk.usage as Record<string, unknown> | undefined
              generationId = chunk.generationId
              provider = chunk.provider
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

        return new Response(
          JSON.stringify({ ok: true, usage, generationId, provider }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})
