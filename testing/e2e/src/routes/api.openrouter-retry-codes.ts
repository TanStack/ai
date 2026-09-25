import { createFileRoute } from '@tanstack/react-router'
import { chat, createChatOptions } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives the OpenRouter chat adapter with `retryCodes: ['429', '5XX']`
 * against an aimock fixture that answers the first request with a 429 and the
 * second with content. The companion spec asserts the SDK retried the 429 and
 * the stream finished with the second response's text.
 */
export const Route = createFileRoute('/api/openrouter-retry-codes')({
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
          retryCodes: ['429', '5XX'],
        })

        let text = ''
        let error: string | undefined
        for await (const chunk of chat({
          ...createChatOptions({ adapter }),
          messages: [
            { role: 'user', content: '[openrouter-retry-codes] say hello' },
          ],
        })) {
          if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
          if (chunk.type === 'RUN_ERROR') error = chunk.message
        }

        return Response.json({ text, error: error ?? null })
      },
    },
  },
})
