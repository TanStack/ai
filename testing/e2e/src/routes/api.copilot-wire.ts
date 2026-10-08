import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

/**
 * Calls aimock the way a GitHub Copilot setup does: fixed headers on the
 * adapter, and an `x-initiator` header for each request through `wrapFetch`.
 * The Responses call is stateless, with encrypted reasoning.
 */
export const Route = createFileRoute('/api/copilot-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body: unknown = await request.json()
        const field = (key: string) =>
          typeof body === 'object' &&
          body !== null &&
          key in body &&
          typeof Reflect.get(body, key) === 'string'
            ? String(Reflect.get(body, key))
            : undefined
        const testId = field('testId')
        const responses = field('api') === 'responses'
        // aimock logs a converted body for /v1/responses, with no `store` or
        // `include`. So the route keeps the body that the adapter sent.
        let sent: unknown
        const text = await chat({
          adapter: openaiCompatibleText('gpt-5.6', {
            name: 'github-copilot',
            baseURL: `${LLMOCK_BASE}/v1`,
            apiKey: 'copilot-token',
            defaultHeaders: {
              'Openai-Intent': 'conversation-edits',
              'X-GitHub-Api-Version': '2026-08-01',
              ...(testId ? { 'X-Test-Id': testId } : {}),
            },
            ...(responses ? { api: 'responses' as const } : {}),
          }),
          messages: [
            {
              role: 'user',
              content: '[oneshot] what is your most popular guitar',
            },
          ],
          ...(responses
            ? {
                modelOptions: {
                  store: false,
                  include: ['reasoning.encrypted_content'],
                },
              }
            : {}),
          wrapFetch: (next) => (input, init) => {
            const headers = new Headers(init?.headers)
            headers.set('x-initiator', 'user')
            if (typeof init?.body === 'string') sent = JSON.parse(init.body)
            return next(input, { ...init, headers })
          },
          stream: false,
        })
        return Response.json({ text, sent })
      },
    },
  },
})
