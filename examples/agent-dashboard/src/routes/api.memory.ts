import { createFileRoute } from '@tanstack/react-router'
import { deleteMemory, listMemory, writeMemory } from '@/server/memory'
import '@/server/meta'

// Pod memory for one member (thread): read entries (GET), add/update (POST),
// remove (DELETE). Server state, so the human operator curates it in the Memory
// panel and it is attached to every future run via `/api/run`.
export const Route = createFileRoute('/api/memory')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        if (!threadId) {
          return Response.json({ error: 'threadId required' }, { status: 400 })
        }
        return Response.json({ entries: listMemory(threadId) })
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          threadId?: string
          key?: string
          value?: string
        }
        if (!body.threadId || !body.key || typeof body.value !== 'string') {
          return Response.json(
            { error: 'threadId, key and value required' },
            { status: 400 },
          )
        }
        writeMemory(body.threadId, body.key, body.value)
        return Response.json({ entries: listMemory(body.threadId) })
      },
      DELETE: ({ request }) => {
        const url = new URL(request.url)
        const threadId = url.searchParams.get('threadId') ?? ''
        const key = url.searchParams.get('key') ?? ''
        if (!threadId || !key) {
          return Response.json(
            { error: 'threadId and key required' },
            { status: 400 },
          )
        }
        deleteMemory(threadId, key)
        return Response.json({ entries: listMemory(threadId) })
      },
    },
  },
})
