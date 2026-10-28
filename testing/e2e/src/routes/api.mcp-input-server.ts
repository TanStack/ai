import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'
import type { MCPToolContext } from '@tanstack/ai-mcp/server'
import { z } from 'zod'

/**
 * A spec 2026 MCP server built with `createMCPServer`.
 *
 * `ask_city` calls `ctx.context.requestInput`. The first call ends as
 * `input_required`, so `chat()` pauses with an `mcp_input` interrupt.
 * After the user answers, the call returns the forecast for that city.
 */
const askCity = toolDefinition({
  name: 'ask_city',
  description: 'Ask the user for a city, then return its forecast',
  inputSchema: z.object({}),
}).server<MCPToolContext>(async (_args, ctx) => {
  const city = await ctx.context.requestInput({ message: 'Which city?' })
  return `Forecast for ${String(city)}: sunny`
})

const server = createMCPServer({
  name: 'weather-input',
  version: '1.0.0',
  tools: [askCity],
})

export const Route = createFileRoute('/api/mcp-input-server')({
  server: {
    handlers: {
      GET: ({ request }) => server.fetch(request),
      POST: ({ request }) => server.fetch(request),
      DELETE: ({ request }) => server.fetch(request),
    },
  },
})
