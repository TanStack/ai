/**
 * /api/mcp-status — connectivity + capability probe for the demo's MCP servers.
 *
 * Hit `GET /api/mcp-status` (optionally `?server=everything`) to get a JSON
 * snapshot of each keyless reference server: whether it connects, and the
 * tools / resources / prompts it exposes. Handy for validating MCP wiring from
 * the client without driving a full chat turn.
 *
 * Each server is probed with a fresh single-use client that is closed before
 * responding — this endpoint never keeps connections warm.
 */
import { createFileRoute } from '@tanstack/react-router'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { Transport } from '@tanstack/ai-mcp'
import {
  everythingTransport,
  memoryTransport,
  sequentialThinkingTransport,
} from '@/lib/mcp-servers'

const SERVERS: Array<{ name: string; transport: () => Transport }> = [
  { name: 'everything', transport: everythingTransport },
  { name: 'memory', transport: memoryTransport },
  { name: 'thinking', transport: sequentialThinkingTransport },
]

interface ServerStatus {
  name: string
  connected: boolean
  tools: Array<string>
  resources: Array<string>
  prompts: Array<string>
  error?: string
}

async function probe(
  name: string,
  makeTransport: () => Transport,
): Promise<ServerStatus> {
  try {
    const client = await createMCPClient({ transport: makeTransport() })
    try {
      const tools = (await client.tools()).map((t) => t.name)
      // Check the advertised capabilities instead of catch-all-ing the list
      // calls: a server without the capability reports "none", while a real
      // transport/protocol failure propagates to the outer catch and is
      // surfaced as a probe error (not silently collapsed to []).
      const resources = client.capabilities.resources
        ? (await client.resources()).map((x) => x.uri)
        : []
      const prompts = client.capabilities.prompts
        ? (await client.prompts()).map((x) => x.name)
        : []
      return { name, connected: true, tools, resources, prompts }
    } finally {
      await client.close()
    }
  } catch (error) {
    return {
      name,
      connected: false,
      tools: [],
      resources: [],
      prompts: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const Route = createFileRoute('/api/mcp-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const only = new URL(request.url).searchParams.get('server')
        const targets = only ? SERVERS.filter((s) => s.name === only) : SERVERS
        const servers = await Promise.all(
          targets.map((s) => probe(s.name, s.transport)),
        )
        return Response.json({ servers })
      },
    },
  },
})
