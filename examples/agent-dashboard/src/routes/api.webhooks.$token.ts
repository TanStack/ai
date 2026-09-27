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
        return Response.json({ ok: true, jobId: job.id, status: job.status })
      },
    },
  },
})
