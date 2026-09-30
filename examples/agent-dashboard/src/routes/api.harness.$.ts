import { createFileRoute } from '@tanstack/react-router'
import { createHarnessHandler } from '@tanstack/ai-harness'
import { authorize, canAccess, getHost, triage } from '@/server/harness'

// The harness protocol control tier: `.../snapshot`, `.../events`, `.../control`.
// The dashboard uses this for the control plane (and the harness-native approval
// path) alongside the AG-UI run stream at /api/agent.
const handler = createHarnessHandler({
  host: getHost(),
  harness: triage,
  authorize,
  canAccess,
})

export const Route = createFileRoute('/api/harness/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
})
