import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { webSearchTool, webFetchTool } from '@tanstack/ai-openrouter/tools'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenRouter chat-completions adapter with both `webSearchTool()`
 * and `webFetchTool()` so the companion spec can inspect aimock's journal
 * (`GET /v1/_requests`) and assert what wire bytes actually crossed the SDK
 * boundary.
 *
 * Both factories emit the SDK's canonical
 * `{type: 'openrouter:web_*', parameters: {...}}` shape, so caller-passed
 * options survive `ChatRequest$outboundSchema` and reach OpenRouter. The
 * spec asserts the captured request body's `tools[*]` against that shape.
 *
 * The spec uses this route purely to generate the captured request; the
 * response content here is irrelevant to the wire-format assertion.
 */
export const Route = createFileRoute('/api/openrouter-web-tools-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined

        // Same X-Test-Id injection pattern as `providers.ts` so this route
        // gets its own aimock test bucket and doesn't collide with other
        // openrouter specs.
        const httpClient = new HTTPClient()
        if (testId) {
          httpClient.addHook('beforeRequest', (req) => {
            const next = new Request(req)
            next.headers.set('X-Test-Id', testId)
            return next
          })
        }

        const adapter = createOpenRouterText('openai/gpt-4o' as never, DUMMY_KEY, {
          serverURL: `${LLMOCK_DEFAULT_BASE}/v1`,
          httpClient,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              { role: 'user', content: '[wire-test] check tools serialization' },
            ],
            tools: [
              webSearchTool({
                engine: 'exa',
                maxResults: 10,
                allowedDomains: ['example.com'],
              }),
              webFetchTool({
                engine: 'openrouter',
                maxContentTokens: 4000,
                allowedDomains: ['example.com'],
                blockedDomains: ['evil.example'],
              }),
            ],
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
