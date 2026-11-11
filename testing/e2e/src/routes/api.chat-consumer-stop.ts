import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import type { Provider } from '@/lib/types'

/**
 * Iterates `chat()` and stops with `break` at the first text chunk, without
 * an `AbortSignal`. Returns the terminal middleware hooks that ran.
 */
export const Route = createFileRoute('/api/chat-consumer-stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const provider = url.searchParams.get('provider') as Provider
        const testId = url.searchParams.get('testId') ?? undefined
        const hooks: Array<string> = []
        for await (const event of chat({
          ...createTextAdapter(provider, undefined, undefined, testId),
          threadId: 'chat-consumer-stop',
          messages: [{ role: 'user', content: '[chat] recommend a guitar' }],
          middleware: [
            {
              name: 'record-terminal-hooks',
              onFinish: () => {
                hooks.push('onFinish')
              },
              onAbort: () => {
                hooks.push('onAbort')
              },
              onError: () => {
                hooks.push('onError')
              },
            },
          ],
        })) {
          if (event.type === 'TEXT_MESSAGE_CONTENT') break
        }
        return Response.json({ hooks })
      },
    },
  },
})
