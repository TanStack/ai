import { createFileRoute } from '@tanstack/react-router'
import {
  resetMockState,
  simulateDeposit,
} from '@/lib/reports/create-handler-bindings'

export const Route = createFileRoute('/_reporting/api/report-demo' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { action, account, amount } = body

        if (action === 'reset') {
          resetMockState()
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (action === 'deposit') {
          if (!account || typeof amount !== 'number') {
            return new Response(
              JSON.stringify({ error: 'Missing account or amount' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
          const newBalance = simulateDeposit(account, amount)
          return new Response(JSON.stringify({ success: true, newBalance }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
