import { createFileRoute } from '@tanstack/react-router'
import { harnessRegistry, listThreads } from '@/server/harness'
import '@/server/meta'

// One embedded host running every registered agent. Shaped as a list so the UI
// can grow to the relay's multi-host model later.
export const Route = createFileRoute('/api/hosts')({
  server: {
    handlers: {
      GET: () =>
        Response.json([
          {
            id: 'local',
            name: 'Local host',
            agents: Object.values(harnessRegistry).map((h) => ({
              name: h.name,
              description: h.description ?? '',
            })),
            sessions: listThreads().length,
          },
        ]),
    },
  },
})
