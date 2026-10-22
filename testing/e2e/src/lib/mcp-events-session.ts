import { createMCPClient } from '@tanstack/ai-mcp'
import {
  createMCPEventWebhook,
  inMemoryMCPEventStore,
} from '@tanstack/ai-mcp/events'
import type { MCPClient } from '@tanstack/ai-mcp'
import type { MCPEvents, MCPEventOccurrence } from '@tanstack/ai-mcp/events'
// One SEP-3415 test server, shared with the ai-mcp unit tests on purpose.
import {
  createTestEventsServer,
  eventsHttpFetch,
} from '../../../../packages/ai-mcp/tests/helpers/events-server'

type EventsClient = MCPClient & { readonly experimental_events: MCPEvents }

type Session = {
  store: ReturnType<typeof inMemoryMCPEventStore>
  events: ReturnType<typeof createTestEventsServer>
  mcpFetch: (request: Request) => Promise<Response>
  webhook: (request: Request) => Promise<Response>
  received: Array<MCPEventOccurrence>
  gaps: Array<{ cursor: string }>
  terminations: Array<{ code: number; message: string }>
  errors: Array<string>
  client?: EventsClient
}

const sessions = new Map<string, Session>()

function createSession(origin: string): Session {
  const store = inMemoryMCPEventStore()
  const received: Array<MCPEventOccurrence> = []
  const gaps: Array<{ cursor: string }> = []
  const terminations: Array<{ code: number; message: string }> = []
  const errors: Array<string> = []
  const webhook = createMCPEventWebhook({
    store,
    onEvent: ({ event }) => {
      received.push(event)
    },
    onGap: ({ gap }) => {
      gaps.push(gap)
    },
    onTerminated: ({ termination }) => {
      terminations.push({
        code: termination.code,
        message: termination.message,
      })
    },
    onError: (error) => {
      errors.push(`${error.stage}: ${error.message}`)
    },
  })
  const events = createTestEventsServer({
    // The client only accepts a 127.0.0.1 http callback, but Vite may bind
    // `localhost` to IPv6 only. Post to the same path on the app origin so
    // each delivery goes over HTTP through the webhook route.
    deliver: async (request) => {
      const url = new URL(request.url)
      return fetch(`${origin}${url.pathname}${url.search}`, {
        method: 'POST',
        headers: request.headers,
        body: await request.arrayBuffer(),
      })
    },
    allowHttpLoopback: true,
    verify: 'challenge',
    ttlMs: { default: 60_000, min: 1 },
    maxAttempts: 3,
  })
  return {
    store,
    events,
    mcpFetch: eventsHttpFetch(events),
    webhook,
    received,
    gaps,
    terminations,
    errors,
  }
}

export function getMcpEventsSession(id: string, origin: string): Session {
  const existing = sessions.get(id)
  if (existing) return existing
  const created = createSession(origin)
  sessions.set(id, created)
  return created
}

export async function resetMcpEventsSession(id: string): Promise<void> {
  const existing = sessions.get(id)
  if (existing?.client) await existing.client.close().catch(() => undefined)
  sessions.delete(id)
}

export async function mcpEventsClient(
  session: Session,
  origin: string,
  sessionId: string,
): Promise<EventsClient> {
  if (!session.client) {
    session.client = await createMCPClient({
      transport: {
        type: 'http',
        url: `${origin}/api/mcp-events-server?session=${encodeURIComponent(sessionId)}`,
      },
      experimental_events: { store: session.store },
    })
  }
  return session.client
}

export function sessionIdFromRequest(request: Request): string | undefined {
  const value = new URL(request.url).searchParams.get('session')
  return value === null || value === '' ? undefined : value
}
