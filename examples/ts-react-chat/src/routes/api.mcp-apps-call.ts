/**
 * /api/mcp-apps-call — the interactive plane for the MCP Apps demo.
 *
 * Mounts `createMcpAppCallHandler` over the SAME two servers the chat route
 * uses (static weather + dynamic Three.js). A widget POSTs an
 * `McpAppCallRequest` ({ threadId, serverId, toolName, args? }); the handler
 * routes by `serverId` (the tool-name prefix), reconnects to that server per
 * call, enforces a same-server allowlist, proxies `callTool`, and returns the
 * result as JSON. Stateless/serverless-safe.
 */
import { createFileRoute } from '@tanstack/react-router'
import { createMCPClient } from '@tanstack/ai-mcp'
import type { MCPClient } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'
import {
  THREEJS_MCP_URL,
  THREEJS_PREFIX,
  WEATHER_PREFIX,
  WEATHER_SERVER_PATH,
} from '@/lib/mcp-apps'

async function tryConnect(
  url: string,
  prefix: string,
): Promise<MCPClient | null> {
  try {
    return await createMCPClient({ transport: { type: 'http', url }, prefix })
  } catch {
    return null
  }
}

export const Route = createFileRoute('/api/mcp-apps-call')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          threadId?: unknown
          serverId?: unknown
          toolName?: unknown
          args?: unknown
          messageId?: unknown
        }
        try {
          body = await request.json()
        } catch {
          return new Response('Bad request', { status: 400 })
        }

        if (
          typeof body.threadId !== 'string' ||
          typeof body.toolName !== 'string'
        ) {
          return new Response('threadId and toolName are required', {
            status: 400,
          })
        }

        const origin = new URL(request.url).origin
        const clients = (
          await Promise.all([
            tryConnect(`${origin}${WEATHER_SERVER_PATH}`, WEATHER_PREFIX),
            tryConnect(THREEJS_MCP_URL, THREEJS_PREFIX),
          ])
        ).filter((c): c is MCPClient => c !== null)

        const handler = createMcpAppCallHandler({ clients })

        try {
          const result = await handler({
            threadId: body.threadId,
            serverId:
              typeof body.serverId === 'string' ? body.serverId : undefined,
            toolName: body.toolName,
            args:
              body.args !== null &&
              typeof body.args === 'object' &&
              !Array.isArray(body.args)
                ? body.args
                : undefined,
            messageId:
              typeof body.messageId === 'string' ? body.messageId : undefined,
          })
          return Response.json(result)
        } finally {
          // The handler reconnects its own per-call client; these are only read
          // for their descriptors (getInfo()), so close them to avoid leaks.
          await Promise.allSettled(clients.map((c) => c.close()))
        }
      },
    },
  },
})
