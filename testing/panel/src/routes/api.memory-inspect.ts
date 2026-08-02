import { createFileRoute } from '@tanstack/react-router'
import {
  lastRecallByThread,
  memoryAdapter,
  panelMemoryScope,
  panelScopeKey,
} from '@/lib/memory-store'

/**
 * Read side of the `/memory` demo. Returns everything the panel needs to show
 * "what's in memory" for a scope, straight off the shared singleton adapter:
 * the full record snapshot, the flat fact list, and what the most recent
 * `recall` injected into the prompt. User/tenant dims are server constants —
 * only `threadId` is taken from the query string (demo multi-thread UX).
 */
export const Route = createFileRoute('/api/memory-inspect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        const scope = panelMemoryScope(threadId)

        const snapshot = await memoryAdapter.inspect?.(scope)
        const facts = await memoryAdapter.listFacts?.(scope)
        const lastRecall = lastRecallByThread.get(panelScopeKey(scope)) ?? null

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
