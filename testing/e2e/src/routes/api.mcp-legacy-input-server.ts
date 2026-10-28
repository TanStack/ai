import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

/**
 * A spec 2025 MCP server built with `createMCPServer`.
 *
 * `book_trip` asks the user twice in one call: a city, then a seat. On spec
 * 2025 each question is an `elicitation/create` request to the client.
 */
const bookTrip = toolDefinition({
  name: 'book_trip',
  description: 'Ask the user for a city and a seat, then book the trip',
  inputSchema: z.object({}),
}).server<MCPToolContext>(async (_args, ctx) => {
  const city = await ctx.context.requestInput({ message: 'Which city?' })
  const seat = await ctx.context.requestInput({ message: 'Which seat?' })
  return `Booked ${String(city)}, seat ${String(seat)}`
})

const server = createMCPServer({
  name: 'trips-legacy',
  version: '1.0.0',
  tools: [bookTrip],
  sessions: 'memory',
})

/** A spec 2026 request carries `mcp-method`. Refuse it, so the client uses 2025. */
function handle(request: Request) {
  if (request.headers.get('mcp-method') !== null) {
    return new Response('This server speaks only spec 2025.', { status: 400 })
  }
  return server.fetch(request)
}

export const Route = createFileRoute('/api/mcp-legacy-input-server')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
      DELETE: ({ request }) => handle(request),
    },
  },
})
