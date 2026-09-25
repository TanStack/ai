import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the real OpenRouter SDK request path with its documented
 * `reasoning.enabled` opt-out or an empty reasoning object. The companion
 * spec inspects aimock's request journal to verify the adapter normalizes or
 * omits the option before the SDK serializes the request body.
 */
export const Route = createFileRoute('/api/openrouter-reasoning-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined
        const scenario =
          url.searchParams.get('scenario') === 'empty' ? 'empty' : 'disabled'

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
                content:
                  scenario === 'empty'
                    ? '[reasoning-wire] empty reasoning'
                    : '[reasoning-wire] disable reasoning',
              },
            ],
            modelOptions:
              scenario === 'empty'
                ? { reasoning: {} }
                : { reasoning: { enabled: false } },
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
