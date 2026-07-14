import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenaiChat } from '@tanstack/ai-openai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'
const ERROR_MESSAGE = 'Synthetic upstream failure'

export const Route = createFileRoute('/api/non-streaming-run-error')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createOpenaiChat('gpt-5.2', DUMMY_KEY, {
          fetch: async () =>
            Response.json(
              {
                error: {
                  message: ERROR_MESSAGE,
                  type: 'rate_limit_error',
                  code: 'rate_limit_exceeded',
                },
              },
              { status: 429 },
            ),
        })

        try {
          const text = await chat({
            adapter,
            messages: [
              {
                role: 'user',
                content: '[non-streaming-error] trigger the synthetic failure',
              },
            ],
            stream: false,
          })

          return Response.json({ rejected: false, text })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const code =
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            typeof error.code === 'string'
              ? error.code
              : null

          return Response.json({ rejected: true, message, code })
        }
      },
    },
  },
})
