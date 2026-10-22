import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Streams one Anthropic chat against the aimock fixture in
 * `fixtures/stream-failure-usage`. aimock sends `message_start`, the start of
 * a text block and one text delta, then drops the connection. Returns the
 * `RUN_ERROR` that `chat()` yields (issue #1735).
 */
export const Route = createFileRoute('/api/anthropic-stream-failure-usage')({
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
            threadId: 'stream-failure-usage',
            messages: [
              {
                role: 'user',
                content: '[stream-failure-usage] count to thirty',
              },
            ],
          })) {
            if (chunk.type === 'RUN_ERROR') {
              runError = { usage: chunk.usage }
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
