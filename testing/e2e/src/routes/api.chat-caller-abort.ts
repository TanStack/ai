import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createTextAdapter } from '@/lib/providers'
import type { Provider } from '@/lib/types'

/**
 * Aborts a chat 10 ms after its first text chunk, while the adapter waits for
 * the next SSE event of the slow `[abort-test]` story, as a user's Stop does.
 * Returns what the logger got on the `errors` channel and the `onAbort` count.
 */
export const Route = createFileRoute('/api/chat-caller-abort')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const provider = url.searchParams.get('provider') as Provider
        const testId = url.searchParams.get('testId') ?? undefined
        const errors: Array<string> = []
        let aborts = 0
        const controller = new AbortController()
        for await (const event of chat({
          ...createTextAdapter(provider, undefined, undefined, testId),
          threadId: 'chat-caller-abort',
          messages: [
            { role: 'user', content: '[abort-test] tell me a long story' },
          ],
          abortController: controller,
          debug: {
            logger: {
              debug: () => {},
              info: () => {},
              warn: () => {},
              error: (message) => errors.push(message),
            },
          },
          middleware: [
            {
              name: 'count-aborts',
              onAbort: () => {
                aborts++
              },
            },
          ],
        })) {
          if (event.type === 'TEXT_MESSAGE_CONTENT') {
            setTimeout(() => controller.abort(), 10)
          }
        }
        return Response.json({ errors, aborts })
      },
    },
  },
})
