import { createFileRoute } from '@tanstack/react-router'
import { choice, decide } from '@tanstack/ai'
import { createOpenaiDecider } from '@tanstack/ai-openai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives `decide()` through the OpenAI evaluate adapter against the
 * `/evaluate-usage-on-failure` aimock mount. The mount answers with valid
 * usage but picks a choice with no entry in `probabilities`, so `decide()`
 * fails while mapping the answer. The route reports the rejection together
 * with the usage seen by the `onUsage` middleware hook.
 */
export const Route = createFileRoute('/api/evaluate-usage-on-failure')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createOpenaiDecider('gpt-6-luna', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/evaluate-usage-on-failure/v1`,
        })

        const onUsageReports: Array<unknown> = []

        let error: { name: string; message: string } | undefined
        try {
          await decide({
            adapter,
            state: { ticket: 'I was charged twice this month.' },
            questions: {
              queue: choice({
                instructions: 'Which team should handle this ticket?',
                options: { billing: null, tech: null },
              }),
            },
            middleware: [
              {
                name: 'usage-observer',
                onUsage: (_ctx, usage) => {
                  onUsageReports.push(usage)
                },
              },
            ],
          })
        } catch (caught) {
          error =
            caught instanceof Error
              ? { name: caught.name, message: caught.message }
              : { name: 'Unknown', message: String(caught) }
        }

        return Response.json({ error, onUsageReports })
      },
    },
  },
})
