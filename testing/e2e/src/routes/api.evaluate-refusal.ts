import { createFileRoute } from '@tanstack/react-router'
import { choice, decide } from '@tanstack/ai'
import { createOpenaiDecider } from '@tanstack/ai-openai'
import type { TokenUsage } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

/**
 * Drives `decide()` with the OpenAI decider against the `/evaluate-refusal`
 * aimock mount, whose Decisions response refuses the only question and bills
 * usage. Returns the rejection as plain fields plus the usage seen by `onUsage`.
 */
export const Route = createFileRoute('/api/evaluate-refusal')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createOpenaiDecider('gpt-6-luna', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/evaluate-refusal/v1`,
        })
        const usageReports: Array<TokenUsage> = []

        try {
          const result = await decide({
            adapter,
            state: 'Customer was double charged and wants the money back.',
            questions: {
              refund: choice({
                instructions: 'Should this ticket get a refund?',
                options: { yes: null, no: null },
              }),
            },
            middleware: [
              {
                name: 'usage-observer',
                onUsage: (_ctx, usage) => {
                  usageReports.push(usage)
                },
              },
            ],
          })
          return Response.json({ result, usageReports })
        } catch (error) {
          const { name, code, message, usage } = error as {
            name?: unknown
            code?: unknown
            message?: unknown
            usage?: unknown
          }
          return Response.json({
            error: { name, code, message, usage },
            usageReports,
          })
        }
      },
    },
  },
})
