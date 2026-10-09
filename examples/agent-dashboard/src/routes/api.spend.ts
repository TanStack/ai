import { createFileRoute } from '@tanstack/react-router'
import { budgets, spendOf } from '@/server/spend'
import '@/server/meta'

// Spend of one thread (tokens, cost, budget), and `POST` to set its budget.
export const Route = createFileRoute('/api/spend')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId')
        if (!threadId) {
          return Response.json({ error: 'threadId required' }, { status: 400 })
        }
        return Response.json(await spendOf(threadId))
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          threadId?: string
          maxTokens?: number
        }
        if (!body.threadId || typeof body.maxTokens !== 'number') {
          return Response.json(
            { error: 'threadId and maxTokens required' },
            { status: 400 },
          )
        }
        budgets.set(body.threadId, body.maxTokens)
        return Response.json(await spendOf(body.threadId))
      },
    },
  },
})
