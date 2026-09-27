import { createFileRoute } from '@tanstack/react-router'
import { newId, webhooks } from '@/server/injection'
import { startScheduler } from '@/server/scheduler'
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
        const body = (await request.json()) as Partial<Webhook>
        if (!body.threadId || !body.channelId || !body.tool) {
          return Response.json(
            { error: 'threadId, channelId and tool required' },
            { status: 400 },
          )
        }
        const token = newId('wh')
        const webhook: Webhook = {
          id: token,
          token,
          threadId: body.threadId,
          channelId: body.channelId,
          tool: body.tool,
          argMapping: body.argMapping ?? {},
        }
        webhooks.set(token, webhook)
        return Response.json({ webhook })
      },
    },
  },
})
