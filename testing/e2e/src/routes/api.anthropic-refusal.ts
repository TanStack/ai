import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

/**
 * Streams one Anthropic chat with server-side fallback on, against the aimock
 * fixture in `fixtures/refusal`. aimock answers with `stop_reason: "refusal"`,
 * the case where no fallback model served the request. Returns the
 * `RUN_FINISHED` finish reason and whether a `RUN_ERROR` was seen.
 */
export const Route = createFileRoute('/api/anthropic-refusal')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createAnthropicChat('claude-opus-5-5', DUMMY_KEY, {
          baseURL: LLMOCK_DEFAULT_BASE,
        })

        let finishReason: string | null | undefined
        let sawRunError = false
        try {
          for await (const chunk of chat({
            adapter,
            threadId: 'anthropic-refusal',
            modelOptions: { fallbacks: 'default' },
            messages: [
              {
                role: 'user',
                content: '[anthropic-refusal] describe a dangerous lab method',
              },
            ],
          })) {
            // chat() moves the finish reason into metadata.tanstack.
            if (chunk.type === 'RUN_FINISHED') {
              finishReason = chunk.metadata?.tanstack?.finishReason
            }
            if (chunk.type === 'RUN_ERROR') sawRunError = true
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, finishReason, sawRunError })
      },
    },
  },
})
