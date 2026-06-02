import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { z } from 'zod'
import type { AnyTextAdapter } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Reproduces issue #682 against the real adapters: with the default
 * `structuredOutput: 'auto'`, `chat({ outputSchema })` first attempts the
 * provider's native structured-output path — rejected with "compiled grammar
 * is too large" — then transparently retries via the lenient forced-tool path.
 *
 * - `anthropic` → the `/structured-output-fallback` mount (native
 *   `output_config` 400 → `structured_output` tool success), full `'auto'`.
 * - `openrouter` → standard aimock (`/v1`) with `structuredOutput: 'tool'`,
 *   replaying the `structured_output` tool fixture (stamped with
 *   `systemFingerprint` so the OpenRouter SDK accepts the completion). Proves
 *   the forced-tool wire round-trips through the real OpenRouter SDK.
 *
 * Test-only — no production path should point an adapter at a custom base URL.
 */
const guitarSchema = z.object({
  name: z.string(),
  price: z.number(),
  reason: z.string(),
  rating: z.number(),
})

function createAdapter(provider: string): AnyTextAdapter {
  if (provider === 'openrouter') {
    return createOpenRouterText('openai/gpt-4o' as never, DUMMY_KEY, {
      serverURL: `${LLMOCK_DEFAULT_BASE}/v1`,
    })
  }
  return createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
    baseURL: `${LLMOCK_DEFAULT_BASE}/structured-output-fallback`,
  })
}

export const Route = createFileRoute('/api/structured-output-fallback')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let provider = 'anthropic'
        try {
          const json = (await request.json()) as { provider?: unknown }
          if (typeof json.provider === 'string') provider = json.provider
        } catch {
          // No body — default to anthropic.
        }

        const adapter = createAdapter(provider)
        // anthropic drives the full `'auto'` reject→recover through the mount;
        // openrouter exercises the forced-tool path directly.
        const structuredOutput = provider === 'openrouter' ? 'tool' : 'auto'

        const chunks: Array<Record<string, unknown>> = []
        let object: unknown = null
        try {
          for await (const chunk of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[so-fallback] recommend a guitar as json',
              },
            ],
            outputSchema: guitarSchema,
            structuredOutput,
            stream: true,
          })) {
            chunks.push(chunk as unknown as Record<string, unknown>)
            if (
              chunk.type === 'CUSTOM' &&
              (chunk as { name?: string }).name === 'structured-output.complete'
            ) {
              object =
                (chunk as { value?: { object?: unknown } }).value?.object ??
                null
            }
          }
        } catch (error) {
          return new Response(
            JSON.stringify({
              chunks,
              object,
              error: error instanceof Error ? error.message : String(error),
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        return new Response(JSON.stringify({ chunks, object, error: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
