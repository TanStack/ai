import { createFileRoute } from '@tanstack/react-router'
import { chat, streamToText } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { createMCPClient, createMCPClients } from '@tanstack/ai-mcp'
import { createMcpAppCallHandler } from '@tanstack/ai-mcp/apps'
import { takeMeta } from '@/lib/mcp-meta-log'

/**
 * Sends request `_meta` to `api.mcp-meta-server` in three ways: the client
 * methods, the MCP Apps call handler, and `chat({ mcp: { requestMeta } })`.
 * Returns the `_meta` the server got for each way.
 */
export const Route = createFileRoute('/api/mcp-request-meta-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const transport = {
          type: 'http' as const,
          url: `${new URL(request.url).origin}/api/mcp-meta-server`,
        }
        takeMeta()

        const meta = { 'acme.com/tenant': 't1', 'mcp.dev/blocked': 1 }
        const client = await createMCPClient({ transport })
        try {
          await client.callTool('echo', {}, { meta })
          await client.readResource('ui://meta/widget', { meta })
          await client.getPrompt('greet', undefined, { meta })
        } finally {
          await client.close()
        }
        const direct = takeMeta()

        // The handler reads the transport from this client and connects again
        // for the call.
        const appClient = await createMCPClient({ transport })
        try {
          const result = await createMcpAppCallHandler({ clients: appClient })(
            { threadId: 't', toolName: 'echo', args: {} },
            { meta: { 'acme.com/tenant': 't2' } },
          )
          if (!result.ok) throw new Error(result.error)
        } finally {
          await appClient.close()
        }
        const handler = takeMeta()

        // No network: the fake model calls `meta_echo` once, then answers.
        const fake = fakeText()
        fake.setResponses([
          { toolCalls: [{ name: 'meta_echo', input: {} }] },
          { text: 'done' },
        ])
        // chat() closes the pool when the run ends.
        const pool = await createMCPClients({ meta: { transport } })
        await streamToText(
          chat({
            threadId: 'request-meta',
            adapter: fake,
            messages: [{ role: 'user', content: 'Call echo' }],
            mcp: {
              clients: [pool],
              requestMeta: (req) => ({
                'acme.com/tenant': 't3',
                'acme.com/method': req.method,
                'acme.com/serverId': req.serverId,
              }),
            },
          }),
        )
        const chatRecords = takeMeta()

        return Response.json({ direct, handler, chat: chatRecords })
      },
    },
  },
})
