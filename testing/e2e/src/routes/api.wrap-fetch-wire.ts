import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import type { ChatMiddleware } from '@tanstack/ai'

/** Adds a header to each model request, so the aimock journal shows it. */
const traceHeader: ChatMiddleware = {
  name: 'trace-header',
  onConfig: (ctx) => {
    if (ctx.phase !== 'beforeModel') return
    return {
      wrapFetch: (next) => (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set('x-wrap-fetch', 'e2e-trace')
        return next(input, { ...init, headers })
      },
    }
  },
}

export const Route = createFileRoute('/api/wrap-fetch-wire')({
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
        const { text } = await chat({
          ...createTextAdapter('openai', undefined, undefined, testId),
          messages: [
            {
              role: 'user',
              content: '[oneshot] what is your most popular guitar',
            },
          ],
          middleware: [traceHeader],
          stream: false,
        })
        return Response.json({ text })
      },
    },
  },
})
