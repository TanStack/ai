// packages/ai-mcp/tests/helpers/in-memory-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  InMemoryTaskMessageQueue,
  InMemoryTaskStore,
} from '@modelcontextprotocol/sdk/experimental/tasks'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { Tool as McpToolDef } from '@modelcontextprotocol/sdk/types.js'

/** Build a connected (server, clientTransport) pair over in-memory transports. */
export async function makeServerWithWeatherTool() {
  const server = new McpServer({ name: 'weather', version: '1.0.0' })
  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair whose only tool always returns an MCP error result. */
export async function makeServerWithFailingTool() {
  const server = new McpServer({ name: 'failing', version: '1.0.0' })
  server.registerTool(
    'always_fails',
    {
      description: 'A tool that always returns an error result',
      inputSchema: {},
    },
    async () => ({
      isError: true,
      content: [{ type: 'text' as const, text: 'boom' }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected pair with one normal tool and one real task-required tool. */
export async function makeServerWithTaskRequiredTool() {
  const taskStore = new InMemoryTaskStore()
  const server = new McpServer(
    { name: 'tasky', version: '1.0.0' },
    {
      capabilities: { tasks: { requests: { tools: { call: {} } } } },
      taskStore,
      taskMessageQueue: new InMemoryTaskMessageQueue(),
      defaultTaskPollInterval: 1,
    },
  )
  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )
  server.experimental.tasks.registerToolTask(
    'research_task',
    {
      description: 'A long-running tool that requires task-based execution',
      inputSchema: { query: z.string() },
      execution: { taskSupport: 'required' },
    },
    {
      async createTask({ query }, { taskStore: store, taskRequestedTtl }) {
        const task = await store.createTask({
          ttl: taskRequestedTtl,
          pollInterval: 1,
        })
        await store.storeTaskResult(task.taskId, 'completed', {
          content: [
            { type: 'text' as const, text: `Research complete: ${query}` },
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
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/**
 * Like {@link makeServerWithTaskRequiredTool}, but the created task never
 * reaches a terminal state — the client polls until aborted. Exposes the
 * taskStore so tests can observe the task server-side.
 */
export async function makeServerWithPendingTaskTool() {
  const taskStore = new InMemoryTaskStore()
  const server = new McpServer(
    { name: 'pending-tasky', version: '1.0.0' },
    {
      capabilities: { tasks: { requests: { tools: { call: {} } } } },
      taskStore,
      taskMessageQueue: new InMemoryTaskMessageQueue(),
      defaultTaskPollInterval: 1,
    },
  )
  server.experimental.tasks.registerToolTask(
    'slow_task',
    {
      description: 'A task that never completes on its own',
      inputSchema: { query: z.string() },
      execution: { taskSupport: 'required' },
    },
    {
      async createTask(_args, { taskStore: store, taskRequestedTtl }) {
        const task = await store.createTask({
          ttl: taskRequestedTtl,
          pollInterval: 1,
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
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport, taskStore }
}

/** Low-level server exposing `tools` across handlers, with a tools/list request counter. */
function makeLowLevelToolServer(options: {
  name: string
  pages: Array<Array<McpToolDef>>
  listChanged?: boolean
  listError?: string
}) {
  const server = new Server(
    { name: options.name, version: '1.0.0' },
    {
      capabilities: {
        tools: options.listChanged ? { listChanged: true } : {},
      },
    },
  )
  let listRequests = 0
  server.setRequestHandler(ListToolsRequestSchema, (req) => {
    listRequests++
    if (options.listError) throw new Error(options.listError)
    const cursor = req.params?.cursor
    const index = cursor ? Number(cursor) : 0
    const nextCursor =
      index + 1 < options.pages.length ? String(index + 1) : undefined
    return {
      tools: options.pages[index] ?? [],
      ...(nextCursor ? { nextCursor } : {}),
    }
  })
  server.setRequestHandler(CallToolRequestSchema, (req) => ({
    content: [{ type: 'text' as const, text: `called ${req.params.name}` }],
  }))
  return { server, getListRequests: () => listRequests }
}

/**
 * Build a connected pair whose tools/list is split across two pages, with a
 * request counter. Every tools/call answers `called <name>` — including names
 * absent from the list.
 */
export async function makeServerWithPaginatedTools() {
  const { server, getListRequests } = makeLowLevelToolServer({
    name: 'paged',
    pages: [
      [
        {
          name: 'first_page_tool',
          description: 'On page one',
          inputSchema: { type: 'object' },
        },
      ],
      [
        {
          name: 'second_page_tool',
          description: 'On page two',
          inputSchema: { type: 'object' },
        },
      ],
    ],
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport, getListRequests }
}

/** Build a connected pair whose tools/list always errors but tools/call works. */
export async function makeServerWithBrokenToolList() {
  const { server } = makeLowLevelToolServer({
    name: 'broken-list',
    pages: [[]],
    listError: 'tools/list unavailable',
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/**
 * Build a connected pair with one tool that declares an outputSchema but
 * answers with text-only content (no structuredContent) — a lax server.
 */
export async function makeServerWithLaxOutputSchemaTool() {
  const { server } = makeLowLevelToolServer({
    name: 'lax',
    pages: [
      [
        {
          name: 'lax_tool',
          description: 'Declares an output schema it never honors',
          inputSchema: { type: 'object' },
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          },
        },
      ],
    ],
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/**
 * Build a connected pair that LISTS a task-required tool but does NOT declare
 * the tasks capability for tools/call (e.g. a proxy stripping capabilities).
 */
export async function makeServerWithUnsupportedTaskTool() {
  const { server } = makeLowLevelToolServer({
    name: 'no-task-capability',
    pages: [
      [
        {
          name: 'plain_tool',
          description: 'plain',
          inputSchema: { type: 'object' },
        },
        {
          name: 'needs_tasks',
          description: 'Requires tasks the server cannot execute',
          inputSchema: { type: 'object' },
          execution: { taskSupport: 'required' },
        },
      ],
    ],
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected pair with a single tool and tools/list_changed support. */
export async function makeServerWithChangingTools() {
  const { server, getListRequests } = makeLowLevelToolServer({
    name: 'changing',
    pages: [
      [{ name: 'tool_a', description: 'A', inputSchema: { type: 'object' } }],
    ],
    listChanged: true,
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport, getListRequests }
}

/** Build a connected (server, clientTransport) pair that exposes a static text resource. */
export async function makeServerWithResource() {
  const server = new McpServer({ name: 'resource-server', version: '1.0.0' })
  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'A simple text resource', mimeType: 'text/plain' },
    async (_uri) => ({
      contents: [{ uri: 'file:///hello.txt', text: 'hello from resource' }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/**
 * Build a connected (server, clientTransport) pair that resolves the
 * `file:///hello.txt` read WITHOUT error but returns contents stamped with a
 * DIFFERENT uri. Used to prove the pool skips a server that resolves but does
 * not actually own the requested uri.
 */
export async function makeServerWithMismatchedResource() {
  const server = new McpServer({ name: 'mismatch-server', version: '1.0.0' })
  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'Resolves the read but returns a different uri' },
    async (_uri) => ({
      contents: [{ uri: 'file:///other.txt', text: 'not what you asked for' }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes a prompt accepting a `code` argument. */
export async function makeServerWithPrompt() {
  const server = new McpServer({ name: 'prompt-server', version: '1.0.0' })
  server.registerPrompt(
    'review-code',
    {
      description: 'Review a code snippet',
      argsSchema: { code: z.string() },
    },
    ({ code }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: `Please review: ${code}` },
        },
      ],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes one tool, one resource, and one prompt. */
export async function makeFullServer() {
  const server = new McpServer({ name: 'full-server', version: '1.0.0' })

  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )

  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'A simple text resource', mimeType: 'text/plain' },
    async (_uri) => ({
      contents: [{ uri: 'file:///hello.txt', text: 'hello from resource' }],
    }),
  )

  server.registerPrompt(
    'review-code',
    {
      description: 'Review a code snippet',
      argsSchema: { code: z.string() },
    },
    ({ code }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: `Please review: ${code}` },
        },
      ],
    }),
  )

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}
