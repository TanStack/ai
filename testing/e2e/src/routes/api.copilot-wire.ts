import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

/**
 * Calls aimock the way a GitHub Copilot setup does: fixed headers on the
 * adapter, and an `x-initiator` header for each request through `wrapFetch`.
 * The Responses call is stateless, with encrypted reasoning. A Claude model
 * goes through the Anthropic adapter, with the Copilot token as a bearer token.
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
        if (field('api') === 'anthropic') {
          // aimock redacts `authorization` and logs no URL query, so the
          // route keeps the raw request.
          let url = ''
          let headers: Record<string, string> = {}
          const text = await chat({
            adapter: anthropicText('claude-sonnet-5-5', {
              baseURL: LLMOCK_BASE,
              authToken: 'copilot-token',
              ...(testId ? { defaultHeaders: { 'X-Test-Id': testId } } : {}),
            }),
            messages: [
              {
                role: 'user',
                content: '[oneshot] what is your most popular guitar',
              },
            ],
            wrapFetch: (next) => (input, init) => {
              const sent = new Headers(init?.headers)
              sent.set('User-Agent', 'e2e/1.0.0')
              sent.set('Openai-Intent', 'conversation-edits')
              sent.set('X-GitHub-Api-Version', '2026-08-01')
              sent.set('X-Interaction-Type', 'conversation-agent')
              sent.set('X-Interaction-Id', 'session-1')
              sent.set('x-initiator', 'user')
              sent.set('anthropic-beta', 'interleaved-thinking-2025-05-14')
              url = input instanceof Request ? input.url : String(input)
              headers = Object.fromEntries(sent)
              return next(input, { ...init, headers: sent })
            },
            stream: false,
          })
          return Response.json({ text, url, headers })
        }
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
