import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the real OpenRouter SDK request path with or without the
 * `streamOptions: { includeUsage: false }` opt-out. The companion spec reads
 * aimock's request journal to check that the opt-out removes `stream_options`
 * from the wire body (#1037), and that the default still sends it.
 */
export const Route = createFileRoute('/api/openrouter-stream-options-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined
        const usageOff = url.searchParams.get('scenario') === 'usage-off'

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
              { role: 'user', content: '[stream-options-wire] usage check' },
            ],
            modelOptions: usageOff
              ? { streamOptions: { includeUsage: false } }
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
