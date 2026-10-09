import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { keyedAdapter } from '@tanstack/ai/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { createOpenaiChat } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

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
          messages: [
            {
              role: 'user',
              content: '[oneshot] what is your most popular guitar',
            },
          ],
          stream: false,
        })
        return Response.json({ text, authorization })
      },
    },
  },
})
