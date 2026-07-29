import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the real OpenRouter SDK request path with its documented
 * `reasoning.enabled` opt-out. The companion spec inspects aimock's request
 * journal to verify the adapter normalizes it before the SDK serializes the
 * request body.
 */
export const Route = createFileRoute('/api/openrouter-reasoning-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined

        const httpClient = new HTTPClient()
        if (testId) {
          httpClient.addHook('beforeRequest', (req) => {
            const next = new Request(req)
            next.headers.set('X-Test-Id', testId)
            return next
          })
        }

        const adapter = createOpenRouterText('openai/gpt-5', DUMMY_KEY, {
          serverURL: `${LLMOCK_DEFAULT_BASE}/v1`,
          httpClient,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[reasoning-wire] disable reasoning',
              },
            ],
            modelOptions: {
              reasoning: { enabled: false },
            },
          })) {
            // Drain the stream.
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true })
      },
    },
  },
})
