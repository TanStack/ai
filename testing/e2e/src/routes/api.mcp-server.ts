import { createFileRoute } from '@tanstack/react-router'
import {
  InMemoryTaskMessageQueue,
  InMemoryTaskStore,
} from '@modelcontextprotocol/sdk/experimental/tasks'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
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
 * Stateless mode (no `sessionIdGenerator`) creates a fresh `McpServer` and
 * transport per request. The module-scoped task store persists task state
 * across the follow-up polling requests made by `callToolStream`; no session
 * bookkeeping is needed.
 *
 * `get_guitar_price` provides an ordinary deterministic tool. The
 * task-required `appraise_guitar_collection` tool returns a distinctive total
 * through the real task create/status/result flow.
 */
const taskStore = new InMemoryTaskStore()
const taskMessageQueue = new InMemoryTaskMessageQueue()

function createMockMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'guitar-store-mcp-mock',
      version: '0.0.1',
    },
    {
      capabilities: { tasks: { requests: { tools: { call: {} } } } },
      taskStore,
      taskMessageQueue,
      defaultTaskPollInterval: 1,
    },
  )

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

  server.experimental.tasks.registerToolTask(
    'appraise_guitar_collection',
    {
      description: 'Long-running appraisal that requires task-based execution',
      inputSchema: { ids: z.array(z.string()) },
      execution: { taskSupport: 'required' },
    },
    {
      async createTask({ ids }, { taskStore: store, taskRequestedTtl }) {
        const task = await store.createTask({
          ttl: taskRequestedTtl,
          pollInterval: 1,
        })
        await store.storeTaskResult(task.taskId, 'completed', {
          content: [
            {
              type: 'text',
              text: `Appraised ${ids.join(', ')} at 4200 total`,
            },
          ],
        })
        return { task }
      },
      async getTask(_args, { taskId, taskStore: store }) {
        return store.getTask(taskId)
      },
      async getTaskResult(_args, { taskId, taskStore: store }) {
        return CallToolResultSchema.parse(await store.getTaskResult(taskId))
      },
    },
  )

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
