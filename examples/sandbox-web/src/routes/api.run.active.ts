import { createFileRoute } from '@tanstack/react-router'
import { runs } from '../run-durable'

/**
 * "Which run is still going for this thread?" — the reload story's first hop.
 * A freshly loaded page has no `Last-Event-ID`, so it resolves the live run
 * from the STABLE `threadId` and then rejoins it via `GET /api/run` (the
 * client's `joinRun` does both automatically when chat persistence is on).
 */
export const Route = createFileRoute('/api/run/active')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          handler: async ({ request }) => {
            const threadId = new URL(request.url).searchParams.get('threadId')
            if (threadId === null) {
              return new Response('threadId is required', { status: 400 })
            }
            const active = await runs.findActiveRun(threadId)
            return Response.json({ runId: active?.runId ?? null })
          },
        },
      }),
  },
})
