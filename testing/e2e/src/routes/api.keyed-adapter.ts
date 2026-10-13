import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { keyedAdapter, keyedAdapters } from '@tanstack/ai/byok'
import {
  byokMissing,
  getByokKey,
  keyedAdapterFromRequest,
} from '@tanstack/ai/byok/server'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOpenaiChat } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

const messages = [
  {
    role: 'user' as const,
    content: '[oneshot] what is your most popular guitar',
  },
]

/**
 * `?mode=many`: `keyedAdapters` with OpenAI and Anthropic. The route builds the
 * adapter of the provider whose key the user sent, and reports which provider
 * got which credential.
 */
async function many(request: Request, testId: string | undefined) {
  const sent: { provider?: string; credential?: string | null } = {}
  const record =
    (provider: string, header: string): typeof fetch =>
    (input, init) => {
      sent.provider = provider
      sent.credential = new Headers(init?.headers).get(header)
      return fetch(input, init)
    }
  const defaultHeaders = testId ? { 'X-Test-Id': testId } : undefined
  const models = keyedAdapters({
    openai: (key) =>
      createOpenaiChat('gpt-5.2', key, {
        baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
        defaultHeaders,
        fetch: record('openai', 'authorization'),
      }),
    anthropic: (key) =>
      createAnthropicChat('claude-haiku-4-5', key, {
        baseURL: LLMOCK_DEFAULT_BASE,
        defaultHeaders,
        fetch: record('anthropic', 'x-api-key'),
      }),
  })
  const adapter = keyedAdapterFromRequest(request, models)
  if (!adapter) return byokMissing('openai')
  const { text } = await chat({ adapter, messages, stream: false })
  return Response.json({ text, ...sent })
}

/**
 * Builds a `keyedAdapter` with the user's key from the BYOK request header,
 * then chats against aimock. aimock redacts `authorization` in its journal,
 * so the adapter's `fetch` records the header the provider gets.
 */
export const Route = createFileRoute('/api/keyed-adapter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let authorization: string | null = null
        const testId = request.headers.get('x-test-id') ?? undefined
        if (new URL(request.url).searchParams.get('mode') === 'many') {
          return many(request, testId)
        }
        const adapter = keyedAdapter('openai', (key) =>
          createOpenaiChat('gpt-5.2', key, {
            baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
            defaultHeaders: testId ? { 'X-Test-Id': testId } : undefined,
            fetch: (input, init) => {
              authorization = new Headers(init?.headers).get('authorization')
              return fetch(input, init)
            },
          }),
        )

        const key = getByokKey(request, adapter.provider)
        if (!key) return byokMissing('openai')

        const { text } = await chat({
          adapter: adapter.create(key),
          messages,
          stream: false,
        })
        return Response.json({ text, authorization })
      },
    },
  },
})
