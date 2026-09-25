import { randomUUID } from 'node:crypto'
import { InMemoryTransport } from '@modelcontextprotocol/client'
import { McpServer, Server } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Tool } from '@modelcontextprotocol/server'

type TaskStatus =
  | 'working'
  | 'input_required'
  | 'completed'
  | 'failed'
  | 'cancelled'

type TaskRecord = {
  taskId: string
  status: TaskStatus
  ttl: number | null
  createdAt: string
  lastUpdatedAt: string
  pollInterval: number
  statusMessage?: string
}

type TextToolResult = {
  content: Array<{ type: 'text'; text: string }>
}

const taskIdParams = z.looseObject({ taskId: z.string() })
const listTasksParams = z.looseObject({ cursor: z.string().optional() })

function textResult(text: string): TextToolResult {
  return {
    content: [{ type: 'text', text }],
  }
}

function stringArg(args: Record<string, unknown> | undefined, key: string) {
  const value = args?.[key]
  return typeof value === 'string' ? value : ''
}

function requestedTaskTtl(task: { ttl?: number } | undefined) {
  return task?.ttl
}

/** In-memory task list the pending-task fixture exposes to tests. */
function createTaskStore() {
  const tasks = new Map<string, { task: TaskRecord; result?: TextToolResult }>()

  return {
    async createTask(ttl: number | undefined) {
      const now = new Date().toISOString()
      const task: TaskRecord = {
        taskId: randomUUID(),
        status: 'working',
        ttl: ttl ?? null,
        createdAt: now,
        lastUpdatedAt: now,
        pollInterval: 1,
      }
      tasks.set(task.taskId, { task })
      return task
    },
    async getTask(taskId: string) {
      const stored = tasks.get(taskId)
      if (stored === undefined) throw new Error(`Task ${taskId} not found`)
      return { ...stored.task }
    },
    async storeTaskResult(
      taskId: string,
      status: 'completed' | 'failed',
      result: TextToolResult,
    ) {
      const stored = tasks.get(taskId)
      if (stored === undefined) throw new Error(`Task ${taskId} not found`)
      stored.result = result
      stored.task = {
        ...stored.task,
        status,
        lastUpdatedAt: new Date().toISOString(),
      }
    },
    async getTaskResult(taskId: string) {
      const stored = tasks.get(taskId)
      if (stored?.result === undefined) {
        throw new Error(`Task ${taskId} has no result`)
      }
      return stored.result
    },
    async cancel(taskId: string) {
      const stored = tasks.get(taskId)
      if (stored === undefined) throw new Error(`Task ${taskId} not found`)
      stored.task = {
        ...stored.task,
        status: 'cancelled',
        statusMessage: 'Client cancelled task execution.',
        lastUpdatedAt: new Date().toISOString(),
      }
      return { ...stored.task }
    },
    async listTasks(cursor?: string) {
      const all = [...tasks.values()].map((stored) => ({ ...stored.task }))
      if (cursor === undefined) return { tasks: all }
      const start = all.findIndex((task) => task.taskId === cursor)
      if (start < 0) throw new Error(`Invalid cursor: ${cursor}`)
      return { tasks: all.slice(start + 1) }
    },
  }
}

function registerTaskMethods(
  server: Server,
  taskStore: ReturnType<typeof createTaskStore>,
) {
  server.setRequestHandler(
    'tasks/get',
    { params: taskIdParams },
    async (params) => taskStore.getTask(params.taskId),
  )
  server.setRequestHandler(
    'tasks/result',
    { params: taskIdParams },
    async (params) => taskStore.getTaskResult(params.taskId),
  )
  server.setRequestHandler(
    'tasks/list',
    { params: listTasksParams },
    async (params) => taskStore.listTasks(params.cursor),
  )
  server.setRequestHandler(
    'tasks/cancel',
    { params: taskIdParams },
    async (params) => taskStore.cancel(params.taskId),
  )
}

const taskCapabilities = {
  tools: {},
  tasks: { requests: { tools: { call: {} } } },
}

async function openInMemory(server: Server | McpServer) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return clientTransport
}

function registerWeatherTool(server: McpServer) {
  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
    },
    async ({ city }) => textResult(`Sunny in ${city}`),
  )
}

function registerReviewPrompt(server: McpServer) {
  server.registerPrompt(
    'review-code',
    {
      description: 'Review a code snippet',
      argsSchema: z.object({ code: z.string() }),
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
}

/** Build a connected (server, clientTransport) pair over in-memory transports. */
export async function makeServerWithWeatherTool() {
  const server = new McpServer({ name: 'weather', version: '1.0.0' })
  registerWeatherTool(server)
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/**
 * Build a connected (server, clientTransport) pair whose tool declares a
 * display `title` plus the full set of MCP `annotations` hints, so the
 * annotation-forwarding path can be exercised against a real server.
 */
export async function makeServerWithAnnotatedTool() {
  const server = new McpServer({ name: 'annotated', version: '1.0.0' })
  server.registerTool(
    'get_weather',
    {
      title: 'Weather Lookup',
      description: 'Get weather for a city',
      inputSchema: z.object({ city: z.string() }),
      annotations: {
        title: 'Legacy Weather Title',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ city }) => textResult(`Sunny in ${city}`),
  )
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/** One read-only tool and one unannotated tool, for tool-policy tests. */
export async function makeServerWithMixedTools() {
  const server = new McpServer({ name: 'mixed', version: '1.0.0' })
  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )
  server.registerTool(
    'set_alert',
    {
      description: 'Create a weather alert',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Alert set for ${city}` }],
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
    },
    async () => ({
      isError: true,
      content: [{ type: 'text' as const, text: 'boom' }],
    }),
  )
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/** Build a connected pair with one normal tool and one real task-required tool. */
export async function makeServerWithTaskRequiredTool() {
  const taskStore = createTaskStore()
  const server = new Server(
    { name: 'tasky', version: '1.0.0' },
    { capabilities: taskCapabilities },
  )
  const tools: Array<Tool> = [
    {
      name: 'get_weather',
      description: 'Get weather for a city',
      inputSchema: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
    {
      name: 'research_task',
      description: 'A long-running tool that requires task-based execution',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      execution: { taskSupport: 'required' },
    },
  ]
  server.setRequestHandler('tools/list', () => ({ tools }))
  server.setRequestHandler('tools/call', async (request) => {
    const name = request.params.name
    const args = request.params.arguments
    if (name === 'get_weather') {
      return textResult(`Sunny in ${stringArg(args, 'city')}`)
    }
    if (name !== 'research_task') throw new Error(`Tool ${name} not found`)
    const answer = `Research complete: ${stringArg(args, 'query')}`
    const body = textResult(answer)
    if (request.params.task === undefined) return body
    const created = await taskStore.createTask(
      requestedTaskTtl(request.params.task),
    )
    await taskStore.storeTaskResult(
      created.taskId,
      'completed',
      textResult(answer),
    )
    const task = await taskStore.getTask(created.taskId)
    return Object.assign(body, { task })
  })
  registerTaskMethods(server, taskStore)
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/**
 * Like {@link makeServerWithTaskRequiredTool}, but the created task never
 * reaches a terminal state. The client polls until aborted. Exposes the
 * taskStore so tests can observe the task server-side.
 */
export async function makeServerWithPendingTaskTool() {
  const taskStore = createTaskStore()
  const server = new Server(
    { name: 'pending-tasky', version: '1.0.0' },
    { capabilities: taskCapabilities },
  )
  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'slow_task',
        description: 'A task that never completes on its own',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        execution: { taskSupport: 'required' },
      },
    ],
  }))
  server.setRequestHandler('tools/call', async (request) => {
    if (request.params.name !== 'slow_task') {
      throw new Error(`Tool ${request.params.name} not found`)
    }
    const task = await taskStore.createTask(
      requestedTaskTtl(request.params.task),
    )
    return Object.assign(
      textResult(`pending ${stringArg(request.params.arguments, 'query')}`),
      { task },
    )
  })
  registerTaskMethods(server, taskStore)
  const clientTransport = await openInMemory(server)
  return { server, clientTransport, taskStore }
}

/** Low-level server exposing `tools` across handlers, with a tools/list request counter. */
function makeLowLevelToolServer(options: {
  name: string
  pages: Array<Array<Tool>>
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
  server.setRequestHandler('tools/list', (request) => {
    listRequests += 1
    if (options.listError !== undefined) throw new Error(options.listError)
    const cursor = request.params?.cursor
    const index = cursor ? Number(cursor) : 0
    const nextCursor =
      index + 1 < options.pages.length ? String(index + 1) : undefined
    const tools = options.pages[index] ?? []
    if (nextCursor === undefined) return { tools }
    return { tools, nextCursor }
  })
  server.setRequestHandler('tools/call', (request) =>
    textResult(`called ${request.params.name}`),
  )
  return { server, getListRequests: () => listRequests }
}

/**
 * Build a connected pair whose tools/list is split across two pages, with a
 * request counter. Every tools/call answers `called <name>`, including names
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
  const clientTransport = await openInMemory(server)
  return { server, clientTransport, getListRequests }
}

/**
 * Two-page tools/list. Both tools declare an outputSchema and answer with
 * text-only content. After tools(), structured output validation applies to
 * both pages.
 */
export async function makeServerWithPaginatedLaxSchemaTool() {
  const { server, getListRequests } = makeLowLevelToolServer({
    name: 'paged-lax',
    pages: [
      [
        {
          name: 'first_page_tool',
          description: 'On page one, declares an output schema it never honors',
          inputSchema: { type: 'object' },
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          },
        },
      ],
      [
        {
          name: 'second_page_tool',
          description: 'On page two, declares an output schema it never honors',
          inputSchema: { type: 'object' },
          outputSchema: {
            type: 'object',
            properties: { value: { type: 'string' } },
          },
        },
      ],
    ],
  })
  const clientTransport = await openInMemory(server)
  return { server, clientTransport, getListRequests }
}

/** tools/list always returns the same nextCursor so pagination never ends. */
export async function makeServerWithLoopingCursor() {
  const server = new Server(
    { name: 'looping-list', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'loop_tool',
        description: 'Listed forever',
        inputSchema: { type: 'object' },
      },
    ],
    nextCursor: 'same',
  }))
  server.setRequestHandler('tools/call', (request) =>
    textResult(`called ${request.params.name}`),
  )
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/** Build a connected pair whose tools/list always errors but tools/call works. */
export async function makeServerWithBrokenToolList() {
  const { server } = makeLowLevelToolServer({
    name: 'broken-list',
    pages: [[]],
    listError: 'tools/list unavailable',
  })
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/**
 * Build a connected pair with one tool that declares an outputSchema but
 * answers with text-only content (no structuredContent). A lax server.
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
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/**
 * Build a connected pair that lists a task-required tool but does not declare
 * the tasks capability for tools/call (for example a proxy stripping capabilities).
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
  const clientTransport = await openInMemory(server)
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
  const clientTransport = await openInMemory(server)
  return { server, clientTransport, getListRequests }
}

/** Build a connected (server, clientTransport) pair that exposes a static text resource. */
export async function makeServerWithResource() {
  const server = new McpServer({ name: 'resource-server', version: '1.0.0' })
  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'A simple text resource', mimeType: 'text/plain' },
    async () => ({
      contents: [{ uri: 'file:///hello.txt', text: 'hello from resource' }],
    }),
  )
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/**
 * Build a connected (server, clientTransport) pair that resolves the
 * `file:///hello.txt` read without error but returns contents stamped with a
 * different uri. Used to prove the pool skips a server that resolves but does
 * not actually own the requested uri.
 */
export async function makeServerWithMismatchedResource() {
  const server = new McpServer({ name: 'mismatch-server', version: '1.0.0' })
  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'Resolves the read but returns a different uri' },
    async () => ({
      contents: [{ uri: 'file:///other.txt', text: 'not what you asked for' }],
    }),
  )
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes a prompt accepting a `code` argument. */
export async function makeServerWithPrompt() {
  const server = new McpServer({ name: 'prompt-server', version: '1.0.0' })
  registerReviewPrompt(server)
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes one tool, one resource, and one prompt. */
export async function makeFullServer() {
  const server = new McpServer({ name: 'full-server', version: '1.0.0' })
  registerWeatherTool(server)
  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'A simple text resource', mimeType: 'text/plain' },
    async () => ({
      contents: [{ uri: 'file:///hello.txt', text: 'hello from resource' }],
    }),
  )
  registerReviewPrompt(server)
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}

/**
 * A tool that declares an outputSchema and returns structuredContent.
 *
 * The server checks that payload against the schema on every call. That is the
 * path that reaches a custom JSON Schema validator. A tool without an output
 * schema never builds a validator at all.
 */
export async function makeServerWithStructuredTool() {
  const server = new McpServer({ name: 'structured', version: '1.0.0' })
  server.registerTool(
    'lookup_user',
    {
      description: 'Look a user up by id',
      inputSchema: z.object({ id: z.string() }),
      outputSchema: z.object({ id: z.string(), name: z.string() }),
    },
    async ({ id }) => ({
      content: [{ type: 'text' as const, text: `user ${id}` }],
      structuredContent: { id, name: 'Ada' },
    }),
  )
  const clientTransport = await openInMemory(server)
  return { server, clientTransport }
}
