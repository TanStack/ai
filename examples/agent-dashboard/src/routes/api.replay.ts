import { createFileRoute } from '@tanstack/react-router'
import { HARNESS_PROTOCOL_VERSION } from '@tanstack/ai-harness'
import { canAccess, getHarnessForThread, getHost } from '@/server/harness'
import '@/server/meta'

// Session replay: the stored AG-UI events of a thread, from the start up to the
// current head (from the HarnessPersistence-backed session feed). Used to
// rehydrate a session view opened fresh, without tailing live.
export const Route = createFileRoute('/api/replay')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId')
        if (!threadId) {
          return Response.json({ error: 'threadId required' }, { status: 400 })
        }
        canAccess({ id: 'local' }, threadId)
        const session = await getHost().open(getHarnessForThread(threadId), {
          threadId,
        })
        const snapshot = session.snapshot()
        const target = snapshot.cursor
        const events: Array<{ cursor: string; event: unknown }> = []
        if (target && target !== '0') {
          const reader = new AbortController()
          for await (const entry of session.events({
            from: '0',
            signal: reader.signal,
          })) {
            events.push({ cursor: entry.cursor, event: entry.event })
            if (entry.cursor === target || events.length > 5000) {
              reader.abort()
              break
            }
          }
        }
        return Response.json({
          protocolVersion: HARNESS_PROTOCOL_VERSION,
          threadId,
          status: snapshot.status,
          pendingInterrupts: snapshot.pendingInterrupts,
          events,
        })
      },
    },
  },
})
