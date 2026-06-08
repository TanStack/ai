import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions, toolDefinition } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { z } from 'zod'
import type { LazyToolsConfig } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Wire-format coverage for the lazy-tools `lazyToolsConfig.includeDescription`
 * knob.
 *
 * The synthetic discovery tool (`__lazy__tool__discovery__`) is what carries
 * the lazy-tool catalog. Its `description` is rendered per `includeDescription`
 * (`'none'` default / `'first-sentence'` / `'full'`) and sent to the provider
 * as part of the `tools` array — but with aimock the model never reflects that
 * text back to the browser, so the only place to observe it end-to-end is the
 * provider request itself.
 *
 * This route drives the OpenAI chat adapter with two `lazy: true` tools and a
 * caller-chosen `includeDescription`, against aimock, so the companion spec can
 * inspect aimock's journal (`GET /v1/_requests`) and assert the discovery
 * tool's catalog description actually crossed the wire with the configured
 * detail level. The model response is irrelevant to the assertion.
 */
const searchInventory = toolDefinition({
  name: 'search_inventory',
  description: 'Search the guitar inventory by keyword. Returns matches.',
  inputSchema: z.object({ query: z.string() }),
  lazy: true,
}).server(async () => JSON.stringify({ ok: true }))

const checkStock = toolDefinition({
  name: 'check_stock',
  description: 'Check stock level for a guitar. Returns quantity on hand.',
  inputSchema: z.object({ guitarId: z.number() }),
  lazy: true,
}).server(async () => JSON.stringify({ ok: true }))

const VALID_INCLUDE = new Set<
  NonNullable<LazyToolsConfig['includeDescription']>
>(['none', 'first-sentence', 'full'])

export const Route = createFileRoute('/api/lazy-tools-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId') ?? undefined
        const rawInclude = url.searchParams.get('includeDescription')
        const includeDescription =
          rawInclude != null &&
          VALID_INCLUDE.has(
            rawInclude as NonNullable<LazyToolsConfig['includeDescription']>,
          )
            ? (rawInclude as NonNullable<LazyToolsConfig['includeDescription']>)
            : 'none'

        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
          defaultHeaders: testId ? { 'X-Test-Id': testId } : undefined,
        })

        try {
          for await (const _ of chat({
            ...createChatOptions({ adapter }),
            messages: [
              {
                role: 'user',
                content: '[lazy-wire] discover and describe inventory tools',
              },
            ],
            tools: [searchInventory, checkStock],
            lazyToolsConfig: { includeDescription },
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
