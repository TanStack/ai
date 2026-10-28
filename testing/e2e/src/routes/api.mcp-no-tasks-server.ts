import { createFileRoute } from '@tanstack/react-router'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

/**
 * Streamable HTTP MCP server that LISTS a task-required tool but does not
 * declare the tasks capability for tools/call. Used by the task-error e2e
 * scenarios (skip on auto-discovery, throw on bind / callTool).
 */
function createNoTasksMcpServer() {
  const server = new Server(
    { name: 'no-task-capability', version: '0.0.1' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: 'plain_tool',
        description: 'plain',
        inputSchema: { type: 'object' as const },
      },
      {
        name: 'needs_tasks',
        description: 'Requires tasks the server cannot execute',
        inputSchema: { type: 'object' as const },
        execution: { taskSupport: 'required' as const },
      },
    ],
  }))
  server.setRequestHandler(CallToolRequestSchema, (req) => ({
    content: [{ type: 'text' as const, text: `called ${req.params.name}` }],
  }))
  return server
}

async function handleMcpRequest(request: Request) {
  const server = createNoTasksMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp-no-tasks-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
