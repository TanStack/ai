import { createFileRoute } from '@tanstack/react-router'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { recordMeta } from '@/lib/mcp-meta-log'

const WIDGET_URI = 'ui://meta/widget'

/**
 * Streamable HTTP MCP server for the request `_meta` wire spec. Each
 * tools/call, resources/read and prompts/get handler records the `_meta` it
 * got. The `echo` tool links `ui://meta/widget`, so `chat()` reads that
 * resource after the tool runs.
 */
function createMetaMcpServer() {
  const server = new Server(
    { name: 'request-meta', version: '0.0.1' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'echo',
        description: 'Echo',
        inputSchema: { type: 'object' as const },
        _meta: { ui: { resourceUri: WIDGET_URI } },
      },
    ],
  }))
  server.setRequestHandler(CallToolRequestSchema, (req) => {
    recordMeta('tools/call', req.params._meta)
    return { content: [{ type: 'text' as const, text: 'echo' }] }
  })
  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: [{ uri: WIDGET_URI, name: 'widget', mimeType: 'text/html' }],
  }))
  server.setRequestHandler(ReadResourceRequestSchema, (req) => {
    recordMeta('resources/read', req.params._meta)
    return {
      contents: [{ uri: WIDGET_URI, mimeType: 'text/html', text: '<p>ok</p>' }],
    }
  })
  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: [{ name: 'greet' }],
  }))
  server.setRequestHandler(GetPromptRequestSchema, (req) => {
    recordMeta('prompts/get', req.params._meta)
    return {
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: 'hi' },
        },
      ],
    }
  })
  return server
}

async function handleMcpRequest(request: Request) {
  const server = createMetaMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp-meta-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
