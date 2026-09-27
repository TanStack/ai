import { createFileRoute } from '@tanstack/react-router'
import { isOffline, pendingCount, setOffline } from '@/server/injection'

// Dev-only: simulate the owning host going offline. The example embeds the host,
// so there is no real offline host — this toggles a dashboard-side flag that
// makes injections queue instead of run, then flush on "reconnect".
export const Route = createFileRoute('/api/dev/offline')({
  server: {
    handlers: {
      GET: () =>
        Response.json({ offline: isOffline(), queued: pendingCount() }),
      POST: async ({ request }) => {
        const body = (await request.json()) as { offline?: boolean }
        setOffline(Boolean(body.offline))
        return Response.json({ offline: isOffline(), queued: pendingCount() })
      },
    },
  },
})
