import { createFileRoute } from '@tanstack/react-router'
import { runInjection, webhooks } from '@/server/injection'
import '@/server/meta'

/** Read a dot path (e.g. "pull_request.number") out of a payload. */
function readPath(payload: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      payload,
    )
}

// Webhook ingress: POST /api/webhooks/:token with a payload. The webhook's arg
// mapping turns the payload into tool args, then it injects like the timer path.
// A single-segment param (not a splat) so it doesn't shadow /api/webhooks.
export const Route = createFileRoute('/api/webhooks/$token')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = (params as { token: string }).token
        const webhook = webhooks.get(token)
        if (!webhook) {
          return Response.json({ error: 'unknown webhook' }, { status: 404 })
        }
        const payload = (await request.json().catch(() => ({}))) as unknown
        const record = (job: {
          id: string
          status: 'queued' | 'accepted' | 'rejected'
          reason?: string
        }) => {
          webhook.deliveries = [
            {
              id: `${job.id}:delivery`,
              at: Date.now(),
              payload,
              status: job.status,
              reason: job.reason,
              jobId: job.id,
            },
            ...(webhook.deliveries ?? []),
          ].slice(0, 20)
          webhooks.set(token, webhook)
        }
        if (webhook.mode === 'prompt') {
          // Drive a model run: the scripted agent reacts and calls its tools.
          const message = `${webhook.message ?? 'A webhook arrived.'}\nPayload: ${JSON.stringify(payload)}`
          const job = await runInjection({
            threadId: webhook.threadId,
            channelId: webhook.channelId,
            mode: 'prompt',
            message,
            trigger: 'webhook',
          })
          record(job)
          return Response.json({ ok: true, jobId: job.id, status: job.status })
        }
        const args: Record<string, unknown> = {}
        for (const [arg, path] of Object.entries(webhook.argMapping)) {
          args[arg] = readPath(payload, path)
        }
        const job = await runInjection({
          threadId: webhook.threadId,
          channelId: webhook.channelId,
          tool: webhook.tool,
          args,
          trigger: 'webhook',
        })
        record(job)
        return Response.json({ ok: true, jobId: job.id, status: job.status })
      },
    },
  },
})
