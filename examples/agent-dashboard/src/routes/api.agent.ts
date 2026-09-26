import { createFileRoute } from '@tanstack/react-router'
import { createAgUiHandler } from '@tanstack/ai-harness/ag-ui'
import { authorize, canAccess, getHost, triage } from '@/server/harness'

// The AG-UI run stream. A bare @ag-ui/client HttpAgent POSTs a RunAgentInput
// (prompt or resume) and gets AG-UI events back as SSE. Spend ticks are on so
// the dashboard can meter tokens live.
const handler = createAgUiHandler({
  host: getHost(),
  harness: triage,
  authorize,
  canAccess,
  stream: { emitSpendEvents: true },
})

export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      POST: ({ request }) => handler(request),
    },
  },
})
