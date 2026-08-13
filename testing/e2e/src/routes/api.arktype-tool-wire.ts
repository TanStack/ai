import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import { type } from 'arktype'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Regression route for #276. ArkType's `type()` returns a *callable function*
 * with `~standard` attached, not a plain object. The schema-detection guards
 * in `@tanstack/ai` previously required `typeof schema === 'object'`, so an
 * ArkType `inputSchema` was never converted to JSON Schema — the raw validator
 * function fell through and, once serialized to the wire, the tool's
 * `parameters` collapsed to `{}` (functions don't survive `JSON.stringify`).
 *
 * This route drives the OpenRouter chat adapter with an ArkType-schema
 * function tool against aimock so the companion spec can inspect aimock's
 * journal (`GET /v1/_requests`) and assert the converted JSON Schema actually
 * crossed the wire. The model response is irrelevant to the assertion.
 */
const arktypeWeatherTool = toolDefinition({
  name: 'get_arktype_weather',
  description: 'Get weather for a city (ArkType-schema tool, #276 wire test)',
  inputSchema: type({
    city: 'string',
    'units?': "'celsius' | 'fahrenheit'",
  }),
}).server(async () => JSON.stringify({ ok: true }))

export const Route = createFileRoute('/api/arktype-tool-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined

        // Same X-Test-Id injection pattern as the other wire specs so this
        // route gets its own aimock test bucket.
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
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[wire-test] arktype tool schema serialization',
              },
            ],
            tools: [arktypeWeatherTool],
          })) {
            // Drain the stream.
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

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
