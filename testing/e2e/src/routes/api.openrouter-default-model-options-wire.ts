import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenRouter chat adapter with `defaultModelOptions` that set
 * provider routing. With `scenario=override`, the call also sets `provider`.
 * The companion spec reads aimock's request journal to check which `provider`
 * went on the wire.
 */
export const Route = createFileRoute(
  '/api/openrouter-default-model-options-wire',
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined
        const override = url.searchParams.get('scenario') === 'override'

        const httpClient = new HTTPClient()
        if (testId) {
          httpClient.addHook('beforeRequest', (req) => {
            const next = new Request(req)
            next.headers.set('X-Test-Id', testId)
            return next
          })
        }

        const adapter = createOpenRouterText('openai/gpt-5.5', DUMMY_KEY, {
          serverURL: `${LLMOCK_DEFAULT_BASE}/v1`,
          httpClient,
          defaultModelOptions: {
            provider: { sort: 'latency', preferredMaxLatency: { p90: 2.5 } },
          },
        })

        try {
          for await (const _ of chat({
            threadId: 'openrouter-default-model-options-wire',
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[default-model-options-wire] route check',
              },
            ],
            modelOptions: override
              ? { provider: { only: ['openai'] } }
              : undefined,
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
