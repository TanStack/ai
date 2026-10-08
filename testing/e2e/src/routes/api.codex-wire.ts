import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

/**
 * Calls aimock the way a ChatGPT Codex backend setup does: fixed headers on
 * the adapter, and a `session-id` header for each request through
 * `wrapFetch`. The Responses call is stateless, with no output limit.
 */
export const Route = createFileRoute('/api/codex-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body: unknown = await request.json()
        const testId =
          typeof body === 'object' &&
          body !== null &&
          'testId' in body &&
          typeof body.testId === 'string'
            ? body.testId
            : undefined
        // aimock redacts `authorization`, and logs a converted body for
        // /v1/responses with no `store` or `include`. So the route keeps the
        // raw headers and body that the adapter sent.
        let sent: unknown
        let headers: Record<string, string> = {}
        const text = await chat({
          adapter: createOpenaiChat('gpt-5.6-terra', 'chatgpt-access-token', {
            baseURL: `${LLMOCK_BASE}/v1`,
            defaultHeaders: {
              originator: 'tanstack-ai-e2e',
              'x-codex-beta-features': 'remote_compaction_v2',
              'chatgpt-account-id': 'account-1',
              ...(testId ? { 'X-Test-Id': testId } : {}),
            },
          }),
          messages: [
            {
              role: 'user',
              content: '[oneshot] what is your most popular guitar',
            },
          ],
          modelOptions: {
            store: false,
            include: ['reasoning.encrypted_content'],
          },
          wrapFetch: (next) => (input, init) => {
            const outgoing = new Headers(init?.headers)
            outgoing.set('session-id', 'thread-1')
            headers = Object.fromEntries(outgoing)
            if (typeof init?.body === 'string') sent = JSON.parse(init.body)
            return next(input, { ...init, headers: outgoing })
          },
          stream: false,
        })
        return Response.json({ text, sent, headers })
      },
    },
  },
})
