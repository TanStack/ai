import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createTextAdapter } from '@/lib/providers'
import type { Logger, ModelMessage } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

/**
 * Aborts a chat 10 ms after its first text chunk, while the adapter waits for
 * the next SSE event of the slow `[abort-test]` story, as a user's Stop does.
 * Returns what the logger got on the `errors` channel and the `onAbort` count.
 *
 * With `at=before-response`, aborts 10 ms after the call instead, before
 * aimock sends its first byte (200 ms). `chat()` stops before the adapter
 * reports that abort, so this mode calls `adapter.chatStream()` directly and
 * returns the `errors` lines and the `RUN_ERROR` code.
 */
export const Route = createFileRoute('/api/chat-caller-abort')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const provider = url.searchParams.get('provider') as Provider
        const testId = url.searchParams.get('testId') ?? undefined
        const errors: Array<string> = []
        const logger: Logger = {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: (message) => errors.push(message),
        }
        const messages: Array<ModelMessage> = [
          { role: 'user', content: '[abort-test] tell me a long story' },
        ]
        const controller = new AbortController()

        if (url.searchParams.get('at') === 'before-response') {
          const { adapter } = createTextAdapter(
            provider,
            undefined,
            undefined,
            testId,
          )
          setTimeout(() => controller.abort(), 10)
          let code: string | undefined
          for await (const chunk of adapter.chatStream({
            threadId: 'chat-caller-abort',
            model: adapter.model,
            messages,
            logger: resolveDebugOption({ logger }),
            request: { signal: controller.signal },
          })) {
            if (chunk.type === 'RUN_ERROR') code = chunk.code
          }
          return Response.json({ errors, code })
        }

        let aborts = 0
        for await (const event of chat({
          ...createTextAdapter(provider, undefined, undefined, testId),
          threadId: 'chat-caller-abort',
          messages,
          abortController: controller,
          debug: { logger },
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
