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
 * In-process MCP server for the **Tasks** mode of the MCP demo — a real MCP
 * server (via `@modelcontextprotocol/sdk`'s `McpServer`) speaking Streamable
 * HTTP, exposing a single tool with `execution.taskSupport: 'required'`.
 *
 * Task-required tools cannot run through ordinary `tools/call`; the client
 * must create a task, poll its status, and fetch the result. `@tanstack/ai-mcp`
 * does this automatically via the SDK's experimental `callToolStream` flow —
 * the companion `/api/mcp-tasks-chat` route connects here and runs the tool
 * inside a real `chat()` agent loop.
 *
 * The appraisal deliberately takes ~4 seconds so a human can watch the task
 * lifecycle: the chat UI shows a pending tool call while the client polls
 * (every 500ms), then the distinctive appraisal total arrives. Lifecycle
 * events are also console.logged (created → completed → result fetched).
 *
 * Stateless mode (no `sessionIdGenerator`) creates a fresh `McpServer` and
 * transport per request; the globalThis-anchored task store persists task
 * state across the follow-up polling requests.
 */
// Anchored on globalThis, NOT module scope: each `tasks/get` poll from the
// client is its own HTTP request, and if Vite invalidates this module between
// polls (HMR after an edit, a route-tree regeneration) a module-scoped store
// would be re-created empty and in-flight polls would fail with "Task not
// found". globalThis persists for the life of the dev-server process.
interface TasksDemoState {
  taskStore: InMemoryTaskStore
  taskMessageQueue: InMemoryTaskMessageQueue
}
const globalState = globalThis as { __mcpTasksDemo?: TasksDemoState }
const { taskStore, taskMessageQueue } = (globalState.__mcpTasksDemo ??= {
  taskStore: new InMemoryTaskStore(),
  taskMessageQueue: new InMemoryTaskMessageQueue(),
})

const APPRAISAL_DURATION_MS = 4_000
const TASK_POLL_INTERVAL_MS = 500
const PRICE_PER_GUITAR = 1_400

function createTasksMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'guitar-appraisal-mcp',
      version: '0.0.1',
    },
    {
      capabilities: { tasks: { requests: { tools: { call: {} } } } },
      taskStore,
      taskMessageQueue,
      defaultTaskPollInterval: TASK_POLL_INTERVAL_MS,
    },
  )

  server.experimental.tasks.registerToolTask(
    'appraise_guitar_collection',
    {
      description:
        'Appraise a collection of guitars by their names/ids. Long-running: requires task-based execution (~4 seconds).',
      inputSchema: { ids: z.array(z.string()) },
      execution: { taskSupport: 'required' },
    },
    {
      async createTask({ ids }, { taskStore: store, taskRequestedTtl }) {
        const task = await store.createTask({
          // ai-mcp doesn't request a TTL (undefined → never expires), and the
          // store outlives requests — expire finished demo tasks after a minute
          // so repeated manual runs don't accumulate for the dev-server lifetime.
          ttl: taskRequestedTtl ?? 60_000,
          pollInterval: TASK_POLL_INTERVAL_MS,
        })
        console.log(
          `[mcp-tasks] created task ${task.taskId} — appraising ${ids.length} guitar(s), completes in ${APPRAISAL_DURATION_MS}ms`,
        )
        // Complete the task in the background; the client keeps polling
        // getTask until the status turns terminal. If the user aborts the
        // chat mid-task, this timer still fires and the stored result is
        // simply never fetched (documented ai-mcp abort semantics).
        setTimeout(() => {
          const total = ids.length * PRICE_PER_GUITAR
          store
            .storeTaskResult(task.taskId, 'completed', {
              content: [
                {
                  type: 'text',
                  text: `Appraisal complete: ${ids.join(', ')} — $${PRICE_PER_GUITAR} each, $${total} total.`,
                },
              ],
            })
            .then(() =>
              console.log(`[mcp-tasks] completed task ${task.taskId}`),
            )
            .catch((error) =>
              console.error(
                `[mcp-tasks] failed to complete task ${task.taskId}:`,
                error,
              ),
            )
        }, APPRAISAL_DURATION_MS)
        return { task }
      },
      async getTask(_args, { taskId, taskStore: store }) {
        return store.getTask(taskId)
      },
      async getTaskResult(_args, { taskId, taskStore: store }) {
        const result = CallToolResultSchema.parse(
          await store.getTaskResult(taskId),
        )
        console.log(`[mcp-tasks] fetched result for task ${taskId}`)
        return result
      },
    },
  )

  return server
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const server = createTasksMcpServer()
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

export const Route = createFileRoute('/api/mcp-tasks-server')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
    },
  },
})
