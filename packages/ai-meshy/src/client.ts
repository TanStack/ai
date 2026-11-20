import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import { createHttpClient } from '@tanstack/ai-utils/http'

/**
 * The base URL of the Meshy API.
 *
 * @experimental Meshy support is experimental and may change.
 */
export const DEFAULT_MESHY_BASE_URL = 'https://api.meshy.ai/openapi'

/**
 * Settings for the Meshy HTTP client.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface MeshyClientConfig {
  /** Meshy API key. Defaults to `MESHY_API_KEY`. */
  apiKey?: string
  /** Defaults to `https://api.meshy.ai/openapi`. */
  baseUrl?: string
  /** Extra headers on every request. */
  headers?: Record<string, string>
  /** Override fetch, for a proxy or tests. */
  fetch?: typeof fetch
}

/**
 * The error for a Meshy response that is not 2xx. `status` is the HTTP status.
 *
 * @experimental Meshy support is experimental and may change.
 */
export class MeshyApiError extends Error {
  readonly status: number

  constructor(status: number, detail: string) {
    super(`Meshy request failed (${status}): ${detail}`)
    this.name = 'MeshyApiError'
    this.status = status
  }
}

/**
 * A small Meshy HTTP client. Paths are relative to the base URL, for example
 * `/v2/text-to-3d`.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface MeshyClient {
  get: <T>(path: string, options?: MeshyGetOptions) => Promise<T>
  post: <T>(path: string, body: object, signal?: AbortSignal) => Promise<T>
  delete: (path: string, signal?: AbortSignal) => Promise<void>
}

interface MeshyGetOptions {
  /** Pass a list as a comma string. The client turns arrays into `key[]=`. */
  query?: Record<string, string | number | undefined>
  signal?: AbortSignal
}

// The `message` of a Meshy error body, else the raw text.
function errorDetail(body: unknown, text: string | undefined) {
  const isObject = typeof body === 'object' && body !== null
  if (isObject && 'message' in body && typeof body.message === 'string') {
    return body.message
  }
  return text ?? JSON.stringify(body)
}

/**
 * Creates a Meshy HTTP client. It sends `Authorization: Bearer <key>`.
 *
 * A `GET` retries on 408, 409, 429, and 5xx, and obeys `Retry-After`. A `POST`
 * or `DELETE` never retries: Meshy has no idempotency key, so a retried create
 * can charge twice.
 *
 * @param config - The API key, base URL, extra headers, and `fetch`. The API
 * key defaults to the `MESHY_API_KEY` environment variable.
 * @throws {MeshyApiError} When Meshy answers with a status that is not 2xx.
 * @throws {Error} When no API key is given and `MESHY_API_KEY` is not set.
 *
 * @example
 * const meshy = createMeshyClient()
 * const task = await meshy.get<MeshyTask>(`/v2/text-to-3d/${id}`)
 *
 * @experimental Meshy support is experimental and may change.
 */
export function createMeshyClient(config?: MeshyClientConfig) {
  const apiKey = config?.apiKey ?? getApiKeyFromEnv('MESHY_API_KEY')
  const http = createHttpClient({
    baseURL: config?.baseUrl ?? DEFAULT_MESHY_BASE_URL,
    headers: { ...config?.headers, authorization: `Bearer ${apiKey}` },
    ...(config?.fetch ? { fetch: config.fetch } : {}),
    makeError: (status, body, text) =>
      new MeshyApiError(status ?? 0, errorDetail(body, text)),
  })

  const client: MeshyClient = {
    async get<T>(path: string, options?: MeshyGetOptions) {
      const response = await http.request({
        method: 'get',
        path,
        query: options?.query,
        signal: options?.signal,
      })
      return (await response.json()) as T
    },
    async post<T>(path: string, body: object, signal?: AbortSignal) {
      const response = await http.request({
        method: 'post',
        path,
        body,
        signal,
        maxRetries: 0,
      })
      return (await response.json()) as T
    },
    async delete(path: string, signal?: AbortSignal) {
      const response = await http.request({
        method: 'delete',
        path,
        signal,
        maxRetries: 0,
      })
      await response.body?.cancel()
    },
  }
  return client
}

/**
 * The status of a Meshy task.
 *
 * @experimental Meshy support is experimental and may change.
 */
export type MeshyTaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'

/**
 * The fields that every Meshy task has. Each endpoint adds its own fields.
 *
 * @experimental Meshy support is experimental and may change.
 */
export interface MeshyTask {
  id: string
  type?: string
  status: MeshyTaskStatus
  progress?: number
  task_error?: { type?: string; message: string; code?: string } | null
  [key: string]: unknown
}

/**
 * Maps a Meshy task status to the TanStack AI job status.
 *
 * `FAILED` and `CANCELED` become `failed`. The error is the Meshy
 * `task_error.message`, or `Meshy task <status>` when Meshy sends no message.
 *
 * @param task - The Meshy task from a `GET` request.
 *
 * @example
 * const { status, progress, error } = mapMeshyStatus(task)
 *
 * @experimental Meshy support is experimental and may change.
 */
export function mapMeshyStatus(task: MeshyTask): {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
} {
  const progress =
    typeof task.progress === 'number' ? { progress: task.progress } : {}
  switch (task.status) {
    case 'PENDING':
      return { status: 'pending', ...progress }
    case 'IN_PROGRESS':
      return { status: 'processing', ...progress }
    case 'SUCCEEDED':
      return { status: 'completed', ...progress }
    case 'FAILED':
    case 'CANCELED':
      return {
        status: 'failed',
        ...progress,
        error: task.task_error?.message || `Meshy task ${task.status}`,
      }
    default: {
      const unknownStatus: never = task.status
      throw new Error(`Unknown Meshy task status: ${String(unknownStatus)}`)
    }
  }
}

/**
 * Cancels a Meshy task without losing paid work. Meshy cancels and refunds
 * only a `PENDING` task, and a `DELETE` on a finished task erases its files.
 * So this reads the task first:
 *
 * - `PENDING`: sends `DELETE`.
 * - `IN_PROGRESS`, or a 409 on the `DELETE`: throws. The task finishes and
 *   is billed.
 * - Finished: does nothing.
 *
 * @param client - The Meshy client.
 * @param taskPath - The task path, for example `/v1/rigging/<id>`.
 * @param jobId - The task id, for the error message.
 * @param abortSignal - Stops the requests.
 */
export async function cancelMeshyTask(
  client: MeshyClient,
  taskPath: string,
  jobId: string,
  abortSignal?: AbortSignal,
) {
  const runningError = (cause?: unknown) =>
    new Error(
      `Meshy task ${jobId} is already running and cannot be canceled`,
      cause === undefined ? undefined : { cause },
    )
  const task = await client.get<MeshyTask>(taskPath, { signal: abortSignal })
  if (task.status === 'IN_PROGRESS') throw runningError()
  if (task.status !== 'PENDING') return
  try {
    await client.delete(taskPath, abortSignal)
  } catch (error) {
    const isRunning = error instanceof MeshyApiError && error.status === 409
    throw isRunning ? runningError(error) : error
  }
}
