import { createFileRoute } from '@tanstack/react-router'
import { lastRecallBySession, memoryAdapter } from '@/lib/memory-store'

/**
 * Read side of the `/memory` demo. Returns everything the panel needs to show
 * "what's in memory" for a session, straight off the shared singleton adapter:
 * the full record snapshot, the flat fact list, and what the most recent
 * `recall` injected into the prompt.
 */
export const Route = createFileRoute('/api/memory-inspect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sessionId =
          new URL(request.url).searchParams.get('sessionId') ?? ''
        const scope = { sessionId }

        const snapshot = await memoryAdapter.inspect?.(scope)
        const facts = await memoryAdapter.listFacts?.(scope)
        const lastRecall = lastRecallBySession.get(sessionId) ?? null

        return new Response(
          JSON.stringify({
            snapshot: snapshot ?? null,
            facts: facts ?? [],
            lastRecall,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})
