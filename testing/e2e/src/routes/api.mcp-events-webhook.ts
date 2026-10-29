import { createFileRoute } from '@tanstack/react-router'
import {
  getMcpEventsSession,
  sessionIdFromRequest,
} from '@/lib/mcp-events-session'

export const Route = createFileRoute('/api/mcp-events-webhook')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const sessionId = sessionIdFromRequest(request)
        if (sessionId === undefined) {
          return Response.json(
            { error: 'session query is required' },
            { status: 400 },
          )
        }
        return getMcpEventsSession(
          sessionId,
          new URL(request.url).origin,
        ).webhook(request)
      },
    },
  },
})
