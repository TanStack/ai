import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { InMemoryTransport, createMCPClient } from '@tanstack/ai-mcp'
import { Server } from '@modelcontextprotocol/server'

/**
 * An in-process MCP server. Its `search_docs` tool returns text for the
 * model and `_meta.sources` for the app.
 */
async function connectDocsServer() {
  const server = new Server(
    { name: 'result-meta', version: '0.0.1' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'search_docs',
        description: 'Search the docs',
        inputSchema: {
          type: 'object' as const,
          properties: { query: { type: 'string' } },
        },
      },
    ],
  }))
  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text' as const, text: 'MCP_ANSWER' }],
    _meta: {
      sources: [
        {
          id: 'mcp-lighthouse',
          title: 'MCP lighthouse guide',
          url: 'https://mcp.example.com/lighthouse',
        },
      ],
    },
  }))
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return createMCPClient({ transport: clientTransport })
}

/**
 * Chat endpoint for `/tool-result-metadata?mode=mcp`. The fake model calls the
 * MCP `search_docs` tool once, then answers. `makeMcpExecute` copies the
 * result `_meta` into the result metadata, so the page shows the sources.
 */
export const Route = createFileRoute('/api/mcp-result-meta-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromRequest(request)
        const fake = fakeText()
        fake.setResponses([
          {
            toolCalls: [
              { name: 'search_docs', input: { query: 'lighthouse' } },
            ],
          },
          { text: 'MCP_RESULT_META_OK the MCP docs are below.' },
        ])
        // chat() closes the client when the run ends.
        const client = await connectDocsServer()
        return toServerSentEventsResponse(
          chat({
            adapter: fake,
            messages: params.messages,
            threadId: params.threadId,
            runId: params.runId,
            mcp: { clients: [client] },
          }),
        )
      },
    },
  },
})
