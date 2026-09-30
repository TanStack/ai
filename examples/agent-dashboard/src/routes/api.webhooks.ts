import { createFileRoute } from '@tanstack/react-router'
import { newId, webhooks } from '@/server/injection'
import { startScheduler } from '@/server/scheduler'
import { noteThread } from '@/server/harness'
import type { Webhook } from '@/server/injection'
import '@/server/meta'

// Webhook management (ingress is /api/webhooks/:token, see api.webhooks.$.ts).
export const Route = createFileRoute('/api/webhooks')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const channelId = new URL(request.url).searchParams.get('channelId')
        const rows = [...webhooks.values()].filter(
          (w) => !channelId || w.channelId === channelId,
        )
        return Response.json({ webhooks: rows })
      },
      POST: async ({ request }) => {
        startScheduler()
        const body = (await request.json()) as Partial<Webhook> & {
          harness?: string
        }
        const mode = body.mode ?? 'tool'
        if (!body.threadId || !body.channelId) {
          return Response.json(
            { error: 'threadId and channelId required' },
            { status: 400 },
          )
        }
        if (mode === 'tool' && !body.tool) {
          return Response.json(
            { error: 'tool required for a tool webhook' },
            { status: 400 },
          )
        }
        if (body.harness) noteThread(body.threadId, body.harness)
        const token = newId('wh')
        const webhook: Webhook = {
          id: token,
          token,
          threadId: body.threadId,
          channelId: body.channelId,
          mode,
          tool: body.tool ?? '',
          argMapping: body.argMapping ?? {},
          message: body.message,
        }
        webhooks.set(token, webhook)
        return Response.json({ webhook })
      },
    },
  },
})
