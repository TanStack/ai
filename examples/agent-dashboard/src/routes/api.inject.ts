import { createFileRoute } from '@tanstack/react-router'
import { canAccess, noteThread } from '@/server/harness'
import { runInjection } from '@/server/injection'
import { startScheduler } from '@/server/scheduler'
import '@/server/meta'

// Run-now / programmatic injection: execute one public tool out-of-band. Private
// or unknown tools are rejected by the harness `{ op: 'tool' }` op.
export const Route = createFileRoute('/api/inject')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        startScheduler()
        const body = (await request.json()) as {
          threadId?: string
          channelId?: string
          tool?: string
          args?: unknown
          jobId?: string
          harness?: string
        }
        if (!body.threadId || !body.tool) {
          return Response.json(
            { error: 'threadId and tool required' },
            { status: 400 },
          )
        }
        canAccess({ id: 'local' }, body.threadId)
        if (body.harness) noteThread(body.threadId, body.harness)
        const job = await runInjection({
          threadId: body.threadId,
          channelId: body.channelId,
          tool: body.tool,
          args: body.args,
          trigger: 'manual',
          jobId: body.jobId,
        })
        return Response.json({
          jobId: job.id,
          status: job.status,
          ...(job.reason ? { reason: job.reason } : {}),
        })
      },
    },
  },
})
