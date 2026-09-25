import { createFileRoute } from '@tanstack/react-router'
import { RUN_CANCEL_REASON, requestRunCancel } from '@tanstack/ai'
import { driving, runs } from '../run-durable'

/**
 * The explicit cancel — `chat.stop()` alone is NOT one. On a durable run a
 * closed connection is indistinguishable from a refresh, so it detaches and
 * the agent keeps working (and spending). Intent arrives out of band, on both
 * bands:
 *
 * 1. durable — `requestRunCancel` records `cancelRequested` on the run record,
 *    which reaches a run this process is not currently driving;
 * 2. in-process — abort the driving controller with `RUN_CANCEL_REASON`, the
 *    fast path that stops a co-located drive immediately AND destroys the
 *    sandbox (the only real cancel: no signal reaches the agent process).
 */
export const Route = createFileRoute('/api/run/cancel')({
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        POST: {
          handler: async ({ request }) => {
            let body: unknown
            try {
              body = await request.json()
            } catch {
              return new Response('invalid JSON body', { status: 400 })
            }
            if (
              body === null ||
              typeof body !== 'object' ||
              !('threadId' in body) ||
              typeof body.threadId !== 'string'
            ) {
              return new Response('threadId is required', { status: 400 })
            }

            const active = await runs.findActiveRun(body.threadId)
            if (!active) return new Response(null, { status: 204 })

            await requestRunCancel(runs, active.runId)
            driving.get(active.runId)?.abort(RUN_CANCEL_REASON)
            return new Response(null, { status: 204 })
          },
        },
      }),
  },
})
