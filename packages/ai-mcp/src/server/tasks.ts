import { isCallToolResult } from '@modelcontextprotocol/server'
import type { Task } from '@modelcontextprotocol/server'
import type { TaskStore } from './stores'

const toolFailedMessage = 'The tool failed.'

/**
 * One task in the store.
 * It is the spec 2025-11-25 `Task` that `tasks/get` returns, plus the
 * fields that never leave the server: the owner and the tool result.
 */
type StoredTask = Task & {
  status: 'working' | 'completed' | 'failed' | 'cancelled'
  /** The auth subject that started the task. Absent without auth. */
  owner?: string
  /** The tool output. Present when `status` is `completed`. */
  result?: unknown
}

type StartTaskOptions = {
  /** Task store. Use `inMemoryTaskStore()` or another {@link TaskStore}. */
  store: TaskStore
  /**
   * Keeps the process alive until the tool run settles.
   * The promise resolves after the store saves the tool result,
   * or the tool error.
   */
  waitUntil?: (promise: Promise<unknown>) => void
  /** The auth subject that starts the task. Only this subject can read it. */
  owner?: string
}

/** The abort controllers of the tasks that run in this process, by id. */
const running = new Map<string, AbortController>()

/**
 * Starts a tool run and returns a task id before the run finishes.
 *
 * `run` is the tool function. This function calls `run` in this process.
 * The caller passes `inMemoryTaskStore()` or another TaskStore
 * on `options.store`.
 * When you pass `options.waitUntil`, this function calls it
 * with the in-flight promise.
 * That promise settles after the store saves the tool result or the tool error.
 * If the store rejects the first save, this function rejects.
 * A tool error does not reject this function.
 * The store records the error on the task as `statusMessage`.
 *
 * `run` gets a signal that `cancelTask` aborts. A cancelled task keeps its
 * `cancelled` status: the late result or error of `run` is not saved.
 *
 * @param run - Tool function. It returns the tool result.
 * @param options - `store` is required. `waitUntil` is optional.
 *
 * @example
 * ```ts
 * const store = inMemoryTaskStore()
 * const handle = await startTask(() => Promise.resolve({ text: 'done' }), {
 *   store,
 * })
 * ```
 */
export async function startTask(
  run: (signal: AbortSignal) => Promise<unknown>,
  options: StartTaskOptions,
) {
  const taskId = crypto.randomUUID()
  const now = new Date().toISOString()
  const working: StoredTask = {
    taskId,
    status: 'working',
    ttl: null,
    createdAt: now,
    lastUpdatedAt: now,
    ...(options.owner === undefined ? {} : { owner: options.owner }),
  }
  await options.store.set(taskId, working)
  const controller = new AbortController()
  running.set(taskId, controller)
  const settle = async (task: StoredTask) => {
    running.delete(taskId)
    if (!controller.signal.aborted) await options.store.set(taskId, task)
  }

  // A tool can throw before it returns a promise. `.then` turns that
  // throw into a rejection, so the store records it.
  const inflight = Promise.resolve()
    .then(() => run(controller.signal))
    .then(
      (result) =>
        settle({
          ...working,
          status: 'completed',
          lastUpdatedAt: new Date().toISOString(),
          result,
        }),
      (error: unknown) =>
        settle({
          ...working,
          status: 'failed',
          lastUpdatedAt: new Date().toISOString(),
          statusMessage: errorMessage(error),
        }),
    )
  const waitUntil = options.waitUntil
  if (waitUntil !== undefined) {
    waitUntil(inflight)
  } else {
    // A failed save leaves the task `working`. Say so on stderr.
    void inflight.catch((error: unknown) => {
      console.error(`Task ${taskId} could not save its result:`, error)
    })
  }

  return { taskId }
}

/**
 * Returns the task record for a poll, or `null` when the id is absent.
 * The result is also `null` when `owner` is not the caller that
 * started the task.
 *
 * `task` is the spec 2025-11-25 `Task` that `tasks/get` returns.
 * `record` also has the tool result and the owner.
 *
 * @param taskId - Id from `startTask`.
 * @param store - Same store that `startTask` received.
 * @param owner - The auth subject of the caller. Absent without auth.
 *
 * @example
 * ```ts
 * const polled = await getTask(handle.taskId, store)
 * ```
 */
export async function getTask(
  taskId: string,
  store: TaskStore,
  owner?: string,
) {
  const value = await store.get(taskId)
  if (!isStoredTask(value)) return null
  if (value.owner !== owner) return null
  return { record: value, task: taskView(value) }
}

/**
 * Cancels the task of `record` (a `working` task from {@link getTask}):
 * aborts its run, when it runs in this process, and saves it as
 * `cancelled`. Returns the spec 2025-11-25 `Task` for `tasks/cancel`.
 * When the task got a terminal status after the caller read `record`, the
 * task does not change, and the result is that terminal `Task`.
 */
export async function cancelTask(record: StoredTask, store: TaskStore) {
  // Abort first, so the run does not save a late result over the cancel.
  // ponytail: a run on another instance of the server is not aborted. Its
  // late result replaces the cancel. Add a store-backed flag if that matters.
  const controller = running.get(record.taskId)
  controller?.abort()
  if (controller === undefined) {
    // The run can end after the caller read `record`. Keep its result.
    // ponytail: a re-read, not a compare-and-set. KeyedStore has no CAS.
    const current = await store.get(record.taskId)
    if (isStoredTask(current) && current.status !== 'working') {
      return taskView(current)
    }
  }
  const cancelled: StoredTask = {
    ...record,
    status: 'cancelled',
    lastUpdatedAt: new Date().toISOString(),
  }
  await store.set(record.taskId, cancelled)
  return taskView(cancelled)
}

function taskView(record: StoredTask) {
  const task = {
    taskId: record.taskId,
    status: record.status,
    ttl: record.ttl,
    createdAt: record.createdAt,
    lastUpdatedAt: record.lastUpdatedAt,
    ...(record.statusMessage === undefined
      ? {}
      : { statusMessage: record.statusMessage }),
  } satisfies Task
  return task
}

/**
 * Turns a tool output into an MCP `CallToolResult`.
 * A string becomes one text block. Any other value becomes a JSON text block.
 * An object also becomes `structuredContent`. With `structured`, every
 * value does, so the result matches an advertised output schema.
 */
export function toCallToolResult(output: unknown, structured = false) {
  // A tool that builds its own MCP result keeps it: its content blocks,
  // its structuredContent, and its isError flag.
  if (isCallToolResult(output)) return output
  // JSON.stringify(undefined) is undefined. A text block needs a string.
  const text =
    typeof output === 'string' ? output : (JSON.stringify(output) ?? '')
  const content = [{ type: 'text' as const, text }]
  if (structured || isRecord(output)) {
    return { content, structuredContent: output }
  }
  return { content }
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.length > 0) return error.message
  if (typeof error === 'string' && error.length > 0) return error
  return toolFailedMessage
}

function isStoredTask(value: unknown): value is StoredTask {
  if (!isRecord(value)) return false
  const taskIdMissing =
    typeof value.taskId !== 'string' || value.taskId.length === 0
  if (taskIdMissing) return false
  if (typeof value.createdAt !== 'string') return false
  if (typeof value.lastUpdatedAt !== 'string') return false
  if (value.ttl !== null) return false
  if (value.owner !== undefined && typeof value.owner !== 'string') return false
  const messageInvalid =
    value.statusMessage !== undefined && typeof value.statusMessage !== 'string'
  if (messageInvalid) return false
  switch (value.status) {
    case 'working':
    case 'failed':
    case 'cancelled':
      return true
    case 'completed':
      return 'result' in value
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
