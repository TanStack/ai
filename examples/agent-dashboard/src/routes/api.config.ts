import { createFileRoute } from '@tanstack/react-router'
import { HARNESS_PROTOCOL_VERSION, applyInput } from '@tanstack/ai-harness'
import { canAccess, getHost, triage } from '@/server/harness'

// Agent config, versioned alongside the harness protocol. GET returns the
// ConfigOption schemas + current values; POST writes a value through the harness
// (op: 'config'), the same path the control tier uses.
export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const threadId =
          new URL(request.url).searchParams.get('threadId') ?? 'settings'
        canAccess({ id: 'local' }, threadId)
        const session = await getHost().open(triage, { threadId })
        const config = session.config()
        const options = Object.entries(config).map(([key, entry]) => ({
          key,
          option: entry.option,
          value: entry.value,
          owner: entry.owner,
        }))
        return Response.json({
          protocolVersion: HARNESS_PROTOCOL_VERSION,
          threadId,
          options,
        })
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          threadId?: string
          key?: string
          value?: unknown
        }
        if (!body.threadId || !body.key) {
          return Response.json(
            { error: 'threadId and key required' },
            { status: 400 },
          )
        }
        const session = await getHost().open(triage, {
          threadId: body.threadId,
        })
        const receipt = await applyInput(triage, session, {
          op: 'config',
          key: body.key,
          value: body.value,
        })
        return Response.json({
          protocolVersion: HARNESS_PROTOCOL_VERSION,
          receipt,
        })
      },
    },
  },
})
