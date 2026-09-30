import { createFileRoute } from '@tanstack/react-router'
import { createAgUiHandler } from '@tanstack/ai-harness/ag-ui'
import { authorize, canAccessFor, getHost } from '@/server/harness'
import { meta } from '@/server/meta'

// The meta-chat's AG-UI run stream. Same host as every other agent, so its runs
// and tool calls appear in history and the trace view.
const handler = createAgUiHandler({
  host: getHost(),
  harness: meta,
  authorize,
  canAccess: canAccessFor(meta.name),
  stream: { emitSpendEvents: true },
})

export const Route = createFileRoute('/api/meta')({
  server: {
    handlers: {
      POST: ({ request }) => handler(request),
    },
  },
})
