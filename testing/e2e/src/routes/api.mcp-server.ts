import { createFileRoute } from '@tanstack/react-router'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

/**
 * In-process mock MCP server hosted as a TanStack Start API route.
 *
 * This is a *real* MCP server (via `@modelcontextprotocol/sdk`'s `McpServer`)
 * speaking the Streamable HTTP protocol over Web Standard Request/Response.
 * The companion `api.mcp-test` route connects to it at this same dev-server
 * origin via `@tanstack/ai-mcp`'s `createMCPClient({ transport: { type:
 * 'http', url } })`, discovers its tools, and runs them inside a real `chat()`
 * agent loop (with the LLM mocked by aimock).
 *
 * Stateless mode (no `sessionIdGenerator`): a fresh `McpServer` + transport is
 * created per request. This avoids any cross-request session bookkeeping —
 * appropriate for a serverless-style route and for deterministic tests. The
 * transport is closed once the response has been produced.
 *
 * The single tool `get_guitar_price` is fully deterministic: given `{ id }` it
 * returns both a structured payload and a text block carrying `{ id, price:
 * 1999 }`, so the spec can assert the price `1999` reaches the streamed
 * transcript after the tool executes.
 */
function createMockMcpServer(): McpServer {
  const server = new McpServer({
    name: 'guitar-store-mcp-mock',
    version: '0.0.1',
  })

  server.registerTool(
    'get_guitar_price',
    {
      description: 'Get the price of a guitar by its id',
      inputSchema: { id: z.string() },
      outputSchema: { id: z.string(), price: z.number() },
    },
    ({ id }) => {
      const payload = { id, price: 1999 }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      }
    },
  )

  // A task-required tool (experimental MCP tasks). Plain `callTool` would be
  // rejected with -32600, so @tanstack/ai-mcp must EXCLUDE it from tools()
  // discovery — the spec asserts it never reaches the tool list.
  const taskTool = server.registerTool(
    'appraise_guitar_collection',
    {
      description: 'Long-running appraisal that requires task-based execution',
      inputSchema: { ids: z.array(z.string()) },
    },
    () => ({
      content: [{ type: 'text' as const, text: 'unreachable via callTool' }],
    }),
  )
  // registerTool's config doesn't accept `execution` directly in SDK 1.29;
  // RegisteredTool exposes it as a mutable property consumed at list time.
  taskTool.execution = { taskSupport: 'required' }

  // A static resource + prompt so the resource/prompt read+convert path can be
  // exercised end-to-end (see api.mcp-status-test). The catalog text carries a
  // distinctive token (STRAT-001) the spec asserts survives conversion.
  server.registerResource(
    'catalog',
    'guitar://catalog',
    { description: 'Featured guitar catalog', mimeType: 'text/plain' },
    async () => ({
      contents: [
        {
          uri: 'guitar://catalog',
          text: 'Featured guitar: Fender Stratocaster (SKU STRAT-001), price 1999.',
        },
      ],
    }),
  )

  server.registerPrompt(
    'recommend_guitar',
    { description: 'Ask for a beginner-friendly guitar recommendation' },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Recommend a beginner-friendly electric guitar under $500.',
          },
        },
      ],
    }),
  )

  return server
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createMockMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode — no session id is generated or validated. A fresh
    // server+transport pair handles this single request and is then GC'd.
    sessionIdGenerator: undefined,
  })

  // The McpServer assumes ownership of the transport and tears down its own
  // per-request streams when the response stream completes; in stateless mode
  // we deliberately do NOT close the transport here, since doing so before the
  // SSE body drains would abort the in-flight response.
  await server.connect(transport)

  return transport.handleRequest(request)
}

export const Route = createFileRoute('/api/mcp-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
