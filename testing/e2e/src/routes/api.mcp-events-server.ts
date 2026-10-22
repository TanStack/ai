import { createFileRoute } from '@tanstack/react-router'
import {
  getMcpEventsSession,
  sessionIdFromRequest,
} from '@/lib/mcp-events-session'

async function handle(request: Request): Promise<Response> {
  const sessionId = sessionIdFromRequest(request)
  if (sessionId === undefined) {
    return Response.json(
      { error: 'session query is required' },
      { status: 400 },
    )
  }
  return getMcpEventsSession(sessionId, new URL(request.url).origin).mcpFetch(
    request,
  )
}

export const Route = createFileRoute('/api/mcp-events-server')({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
