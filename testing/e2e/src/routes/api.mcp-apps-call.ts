import { createFileRoute } from '@tanstack/react-router'
import { createMCPClient } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'

/**
 * MCP Apps — interactive plane. Mounts `createMcpAppCallHandler` and exposes it
 * as a POST endpoint. A widget (or a test) POSTs an
 * `McpAppCallRequest`-shaped body:
 *
 *   { threadId, serverId, toolName, args?, messageId? }
 *
 * The handler reads the connection descriptor off the MCP client it was given
 * (the same client you'd pass to `chat({ mcp: { clients } })`), reconnects to
 * the in-process MCP Apps server (`api.mcp-apps-server`) per call, enforces a
 * same-server allowlist (a tool the server does not expose → `{ ok: false }`),
 * proxies `callTool`, and always closes the per-call client. We return its JSON
 * result verbatim.
 */
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
          body = (await request.json()) as typeof body
        } catch {
          return new Response('Bad request', { status: 400 })
        }

        if (
          typeof body.threadId !== 'string' ||
          typeof body.serverId !== 'string' ||
          typeof body.toolName !== 'string'
        ) {
          return new Response('threadId, serverId and toolName are required', {
            status: 400,
          })
        }

        // The MCP Apps server lives at this same dev server's origin. Create
        // the client the same way `chat({ mcp })` would; the handler reads its
        // descriptor (via getInfo) and reconnects per call.
        const origin = new URL(request.url).origin
        const widgets = await createMCPClient({
          transport: { type: 'http', url: `${origin}/api/mcp-apps-server` },
          prefix: 'widgets',
        })
        const handler = createMcpAppCallHandler({ clients: widgets })

        const result = await handler({
          threadId: body.threadId,
          serverId: body.serverId,
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
      },
    },
  },
})
