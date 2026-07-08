import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenAI chat-completions adapter against a hand-crafted aimock mount
 * (`/openai-usage-details`) whose stream ends with a usage-only chunk carrying
 * `prompt_tokens_details` / `completion_tokens_details`. The companion spec
 * asserts those reach `RUN_FINISHED.usage` as the canonical detail breakdowns —
 * proving detailed token usage survives end-to-end through the chat pipeline.
 */
export const Route = createFileRoute('/api/openai-usage-details')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createOpenaiChatCompletions('gpt-4o', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/openai-usage-details/v1`,
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
