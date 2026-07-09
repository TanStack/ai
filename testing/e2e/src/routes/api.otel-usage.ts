import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createLocalCaptureTracer } from '@/lib/otel-local-tracer'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives a chat adapter with `otelMiddleware` against the existing
 * hand-crafted aimock mounts that report rich usage, and returns the captured
 * spans. Companion E2E proof for full-usage span emission (#721):
 *
 * - `provider: 'openai'` → `/openai-usage-details` mount, whose trailing usage
 *   chunk carries `total_tokens`, `prompt_tokens_details.cached_tokens`, and
 *   `completion_tokens_details.reasoning_tokens`.
 * - `provider: 'openrouter'` → `/openrouter-cost` mount, whose trailing usage
 *   chunk carries `cost` / `cost_details`.
 *
 * The spec asserts the corresponding `gen_ai.usage.*` / `tanstack.ai.usage.*`
 * attributes land on the iteration and root spans.
 */
export const Route = createFileRoute('/api/otel-usage')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let provider = 'openai'
        try {
          const body = (await request.json()) as { provider?: string }
          if (typeof body.provider === 'string') provider = body.provider
        } catch {
          // No/invalid body — default provider.
        }

        const adapter =
          provider === 'openrouter'
            ? createOpenRouterText('openai/gpt-4o', DUMMY_KEY, {
                serverURL: `${LLMOCK_DEFAULT_BASE}/openrouter-cost/v1`,
              })
            : createOpenaiChatCompletions('gpt-4o', DUMMY_KEY, {
                baseURL: `${LLMOCK_DEFAULT_BASE}/openai-usage-details/v1`,
              })

        const { tracer, spans } = createLocalCaptureTracer()

        try {
          for await (const _chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [{ role: 'user', content: 'hi' }],
            middleware: [otelMiddleware({ tracer })],
          })) {
            // Drain — the assertions live on the captured spans.
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

        return new Response(JSON.stringify({ ok: true, spans }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
