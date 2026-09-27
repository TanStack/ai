import { createFileRoute } from '@tanstack/react-router'
import {
  canAccess,
  getHarnessForThread,
  getHost,
  noteThread,
} from '@/server/harness'
import '@/server/meta'

// A live tail of a thread's session feed: replays from a cursor, then follows new
// events (interactive runs, injected tools, timers, webhooks) as they arrive. The
// channel view opens one per member and projects every event — the single
// projection path for everything out-of-band, no polling.
export const Route = createFileRoute('/api/tail')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const threadId = url.searchParams.get('threadId')
        if (!threadId) {
          return Response.json({ error: 'threadId required' }, { status: 400 })
        }
        // EventSource resumes with Last-Event-ID; fall back to ?from or the start.
        const from =
          request.headers.get('last-event-id') ??
          url.searchParams.get('from') ??
          '0'
        canAccess({ id: 'local' }, threadId)
        const harnessName = url.searchParams.get('harness')
        if (harnessName) noteThread(threadId, harnessName)
        const session = await getHost().open(getHarnessForThread(threadId), {
          threadId,
        })
        const encoder = new TextEncoder()
        const controllerRef = new AbortController()
        request.signal.addEventListener('abort', () => controllerRef.abort(), {
          once: true,
        })
        const stream = new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode(': ok\n\n'))
            try {
              for await (const entry of session.events({
                from,
                signal: controllerRef.signal,
              })) {
                const frame =
                  `id: ${entry.cursor}\n` +
                  `data: ${JSON.stringify({ cursor: entry.cursor, event: entry.event })}\n\n`
                controller.enqueue(encoder.encode(frame))
              }
            } catch {
              // aborted / closed
            }
            try {
              controller.close()
            } catch {
              // already closed
            }
          },
          cancel() {
            controllerRef.abort()
          },
        })
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        })
      },
    },
  },
})
