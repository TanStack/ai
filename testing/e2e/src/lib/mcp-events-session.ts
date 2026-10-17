import { createMCPClient } from '@tanstack/ai-mcp'
import {
  createMCPEventWebhook,
  inMemoryMCPEventStore,
} from '@tanstack/ai-mcp/events'
import type { MCPClient } from '@tanstack/ai-mcp'
import type { MCPEvents, MCPEventOccurrence } from '@tanstack/ai-mcp/events'
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
  client?: EventsClient
}

const sessions = new Map<string, Session>()

function createSession(): Session {
  const store = inMemoryMCPEventStore()
  const received: Array<MCPEventOccurrence> = []
  const gaps: Array<{ cursor: string }> = []
  const terminations: Array<{ code: number; message: string }> = []
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
  })
  const events = createTestEventsServer({
    // Vite's e2e server binds `localhost` (often IPv6-only). The client
    // rejects `localhost` as an http callback host, so subscribe uses
    // 127.0.0.1 and deliveries run in-process through the same handler
    // the HTTP route uses. Package e2e covers signed webhooks over TCP.
    deliver: (request) => webhook(request),
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
  }
}

export function getMcpEventsSession(id: string): Session {
  const existing = sessions.get(id)
  if (existing) return existing
  const created = createSession()
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
