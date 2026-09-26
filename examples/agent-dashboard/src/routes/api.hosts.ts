import { createFileRoute } from '@tanstack/react-router'
import { listThreads, triage } from '@/server/harness'

// One embedded host for the demo. Shaped as a list so the UI can grow to the
// relay's multi-host model later.
export const Route = createFileRoute('/api/hosts')({
  server: {
    handlers: {
      GET: () =>
        Response.json([
          {
            id: 'local',
            name: 'Local host',
            harness: triage.name,
            description: triage.description ?? '',
            sessions: listThreads().length,
          },
        ]),
    },
  },
})
