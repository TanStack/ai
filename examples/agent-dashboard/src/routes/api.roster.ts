import { createFileRoute } from '@tanstack/react-router'
import { getRoster, setRoster } from '@/server/store'
import type { RosterSnapshot } from '@/server/store'

// The team roster (teams/channels/memberships/channelMembers). The client's
// TanStack DB collections own it; this endpoint persists the blob so a fresh tab
// or a restarted server can re-seed them. GET to hydrate on load, POST to save
// after any roster change.
export const Route = createFileRoute('/api/roster')({
  server: {
    handlers: {
      GET: () => Response.json(getRoster()),
      POST: async ({ request }) => {
        const body = (await request.json()) as Partial<RosterSnapshot>
        setRoster({
          teams: body.teams ?? [],
          channels: body.channels ?? [],
          memberships: body.memberships ?? [],
          channelMembers: body.channelMembers ?? [],
        })
        return Response.json({ ok: true })
      },
    },
  },
})
