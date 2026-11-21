import { createFileRoute } from '@tanstack/react-router'
import { boolean, choice, decide, score } from '@tanstack/ai'
import { createGeminiDecider } from '@tanstack/ai-gemini'
import type { TokenUsage } from '@tanstack/ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'AIza-e2e-test-dummy-key'

/**
 * Drives `decide()` with the Gemini decider against the `/evaluate-gemini`
 * aimock mount, whose Decisions response returns a choice, a score, and a
 * boolean answer plus Gemini-shaped usage. Returns the mapped result and the
 * usage seen by `onUsage`.
 */
export const Route = createFileRoute('/api/evaluate-gemini')({
  server: {
    handlers: {
      POST: async () => {
        const adapter = createGeminiDecider('gemini-decision-1', DUMMY_KEY, {
          baseURL: `${LLMOCK_DEFAULT_BASE}/evaluate-gemini`,
        })
        const usageReports: Array<TokenUsage> = []

        const result = await decide({
          adapter,
          state: {
            subject: 'Charged twice for the same invoice',
            body: 'Please refund the extra payment.',
          },
          questions: {
            queue: choice({
              instructions: 'Which team should handle this ticket?',
              options: {
                billing: 'Payments, invoices, refunds',
                tech: 'Bugs, outages, integrations',
                sales: 'Pricing, upgrades, new accounts',
              },
            }),
            urgency: score({
              instructions: 'How urgent is this ticket?',
              levels: ['low', 'medium', 'high'],
            }),
            refund: boolean({
              instructions: 'Is the customer asking for a refund?',
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
      },
    },
  },
})
