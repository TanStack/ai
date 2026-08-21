import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Exercises the real OpenRouter SDK serialization path for schema-bearing
 * calls that explicitly request JSON mode. The companion spec inspects
 * aimock's journal to ensure `json_object` survives structured-output
 * instead of being overwritten by the default `json_schema`.
 */
export const Route = createFileRoute('/api/openrouter-json-object-wire')({
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

        const adapter = createOpenRouterText('openai/gpt-4o', DUMMY_KEY, {
          serverURL: `${LLMOCK_DEFAULT_BASE}/v1`,
          httpClient,
        })

        try {
          const result = await chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[json-object-wire] return a person as json',
              },
            ],
            modelOptions: {
              responseFormat: { type: 'json_object' },
            },
            outputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
              required: ['name', 'age'],
            },
          })

          return Response.json({ ok: true, result })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
