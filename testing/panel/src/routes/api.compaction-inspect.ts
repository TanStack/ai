import { createFileRoute } from '@tanstack/react-router'
import { clearCompactions, getCompactions } from '@/lib/compaction-store'

/**
 * Read side of the `/compaction` demo. GET returns the recorded compaction
 * events for a thread; DELETE clears them (used by "New thread").
 */
export const Route = createFileRoute('/api/compaction-inspect')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        return Response.json({ events: getCompactions(threadId) })
      },
      DELETE: async ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        clearCompactions(threadId)
        return Response.json({ ok: true })
      },
    },
  },
})
