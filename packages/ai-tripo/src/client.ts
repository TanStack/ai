import { fileReferenceFor } from '@tanstack/ai'
import { base64ToArrayBuffer, getApiKeyFromEnv } from '@tanstack/ai-utils'
import { createHttpClient } from '@tanstack/ai-utils/http'
import type { ContentPartSource } from '@tanstack/ai'

/**
 * The base URL of the Tripo v3 API.
 *
 * @experimental Tripo support is experimental and may change.
 */
export const DEFAULT_TRIPO_BASE_URL = 'https://openapi.tripo3d.ai/v3'

/**
 * Settings for the Tripo HTTP client.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoClientConfig {
  /** Tripo API key. Defaults to `TRIPO_API_KEY`. */
  apiKey?: string
  /** Defaults to `https://openapi.tripo3d.ai/v3`. */
  baseUrl?: string
  /** Extra headers on every request. */
  headers?: Record<string, string>
  /** Override fetch, for a proxy or tests. */
  fetch?: typeof fetch
}

/**
 * The error for a failed Tripo request: a status that is not 2xx, or a 2xx
 * body with a `code` that is not `0`. `status` is the HTTP status, `code` is
 * the Tripo error code (for example `2010` for too few credits), and
 * `suggestion` is the fix that Tripo suggests.
 *
 * @experimental Tripo support is experimental and may change.
 */
export class TripoApiError extends Error {
  readonly status: number
  readonly code: number | undefined
  readonly suggestion: string | undefined

  constructor(
    status: number,
    detail: string,
    code?: number,
    suggestion?: string,
  ) {
    super(`Tripo request failed (${status}): ${detail}`)
    this.name = 'TripoApiError'
    this.status = status
    this.code = code
    this.suggestion = suggestion
  }
}

/**
 * A small Tripo HTTP client. Paths are relative to the base URL, for example
 * `/tasks/<id>`. `get` and `post` return the `data` of Tripo's
 * `{ code: 0, data }` body.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoClient {
  get: <T>(path: string, options?: { signal?: AbortSignal }) => Promise<T>
  post: <T>(path: string, body: object, signal?: AbortSignal) => Promise<T>
  /** Uploads a file to `POST /files` and returns its `file_token`. */
  upload: (file: Blob, signal?: AbortSignal) => Promise<string>
}

// Builds the error from a Tripo body `{ code, message, suggestion }`.
function tripoError(status: number, body: unknown, text: string | undefined) {
  const isObject = typeof body === 'object' && body !== null
  if (!isObject) return new TripoApiError(status, text ?? 'Unknown error')
  const message =
    'message' in body && typeof body.message === 'string'
      ? body.message
      : (text ?? JSON.stringify(body))
  const code =
    'code' in body && typeof body.code === 'number' ? body.code : undefined
  const suggestion =
    'suggestion' in body && typeof body.suggestion === 'string'
      ? body.suggestion
      : undefined
  return new TripoApiError(status, message, code, suggestion)
}

// Returns `data` of a 2xx body. Tripo can answer 2xx with a `code` that is
// not 0: that is a failure, not a result.
async function unwrap<T>(response: Response) {
  const body: unknown = await response.json()
  const isSuccess =
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    body.code === 0 &&
    'data' in body
  if (!isSuccess) throw tripoError(response.status, body, undefined)
  return body.data as T
}

// Tripo reads the file type from the file name. Only these types are accepted.
const UPLOAD_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/stl': 'stl',
  'model/obj': 'obj',
  'text/plain': 'obj',
}

/**
 * Creates a Tripo HTTP client. It sends `Authorization: Bearer <key>`.
 *
 * A `GET` retries on 408, 409, 429, and 5xx. A `POST` and an upload never
 * retry: Tripo has no idempotency key, so a retried create can charge twice.
 *
 * @param config - The API key, base URL, extra headers, and `fetch`. The API
 * key defaults to the `TRIPO_API_KEY` environment variable.
 * @throws {TripoApiError} When Tripo answers with a status that is not 2xx, or
 * with a 2xx body whose `code` is not `0`.
 * @throws {Error} When no API key is given and `TRIPO_API_KEY` is not set.
 *
 * @example
 * const tripo = createTripoClient()
 * const task = await tripo.get<TripoTask>(`/tasks/${id}`)
 *
 * @experimental Tripo support is experimental and may change.
 */
export function createTripoClient(config?: TripoClientConfig) {
  const apiKey = config?.apiKey ?? getApiKeyFromEnv('TRIPO_API_KEY')
  const http = createHttpClient({
    baseURL: config?.baseUrl ?? DEFAULT_TRIPO_BASE_URL,
    headers: { ...config?.headers, authorization: `Bearer ${apiKey}` },
    ...(config?.fetch ? { fetch: config.fetch } : {}),
    makeError: (status, body, text) => tripoError(status ?? 0, body, text),
  })

  const post = async <T>(path: string, body: object, signal?: AbortSignal) =>
    unwrap<T>(
      await http.request({ method: 'post', path, body, signal, maxRetries: 0 }),
    )

  const client: TripoClient = {
    async get<T>(path: string, options?: { signal?: AbortSignal }) {
      return unwrap<T>(
        await http.request({ method: 'get', path, signal: options?.signal }),
      )
    },
    post,
    async upload(file, signal) {
      const extension = UPLOAD_EXTENSIONS[file.type]
      if (extension === undefined) {
        throw new Error(
          `tripo: cannot upload a file of type "${file.type}". Pass a known ` +
            `MIME type: ${Object.keys(UPLOAD_EXTENSIONS).join(', ')}.`,
        )
      }
      const form = new FormData()
      form.append('file', file, `upload.${extension}`)
      const data = await post<{ file_token: string }>('/files', form, signal)
      return data.file_token
    },
  }
  return client
}

/**
 * The status of a Tripo task. Tripo can also send other values, for example
 * `unknown`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export type TripoTaskStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'banned'
  | 'expired'

/**
 * The `output` of a Tripo task. Each task type fills different fields.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoTaskOutput {
  model_url?: string
  model_urls?: Array<string>
  rendered_image_url?: string
  seg_model_url?: string
  uv_render_url?: string
  riggable?: boolean
  rig_type?: string
  [key: string]: unknown
}

/**
 * A Tripo task from `GET /tasks/{task_id}`. `status` is a string because
 * Tripo can send a value that is not a {@link TripoTaskStatus}.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface TripoTask {
  task_id: string
  type?: string
  status: string
  progress?: number
  error_code?: number
  error_message?: string
  output?: TripoTaskOutput
}

/**
 * Maps a Tripo task status to the TanStack AI job status.
 *
 * - `queued` becomes `pending`.
 * - `success` becomes `completed`.
 * - `failed`, `cancelled`, `banned`, and `expired` become `failed`. The error
 *   is the Tripo `error_message`, or `Tripo task <status>`.
 * - `running` and every other value (for example `unknown`) become
 *   `processing`, so the caller keeps polling.
 *
 * @param task - The Tripo task from `GET /tasks/{task_id}`.
 *
 * @example
 * const { status, progress, error } = mapTripoStatus(task)
 *
 * @experimental Tripo support is experimental and may change.
 */
export function mapTripoStatus(task: TripoTask): {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
} {
  const progress =
    typeof task.progress === 'number' ? { progress: task.progress } : {}
  switch (task.status) {
    case 'queued':
      return { status: 'pending', ...progress }
    case 'success':
      return { status: 'completed', ...progress }
    case 'failed':
    case 'cancelled':
    case 'banned':
    case 'expired':
      return {
        status: 'failed',
        ...progress,
        error: task.error_message || `Tripo task ${task.status}`,
      }
    default:
      return { status: 'processing', ...progress }
  }
}

/**
 * Turns a content part source into the value of a Tripo `input` field.
 *
 * - `url`: the URL.
 * - `file`: the Tripo task id or `file_token`. A file from another provider
 *   throws.
 * - `data`: uploads the bytes to `POST /files` and returns the `file_token`.
 *   Tripo never gets a data URI.
 *
 * @param client - The Tripo client.
 * @param source - The source of an image or 3D model part.
 * @param signal - Stops the upload.
 *
 * @example
 * const input = await tripoInputFor(client, part.source)
 *
 * @experimental Tripo support is experimental and may change.
 */
export async function tripoInputFor(
  client: TripoClient,
  source: ContentPartSource,
  signal?: AbortSignal,
) {
  switch (source.type) {
    case 'url':
      return source.value
    case 'file':
      return fileReferenceFor(source, 'tripo')
    case 'data': {
      const bytes = base64ToArrayBuffer(source.value)
      const file = new Blob([bytes], { type: source.mimeType })
      return client.upload(file, signal)
    }
    default: {
      const unknownSource: never = source
      throw new Error(
        `tripo: unknown source type ${JSON.stringify(unknownSource)}`,
      )
    }
  }
}
