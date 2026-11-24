import { createTripoClient, mapTripoStatus, tripoInputFor } from './client'
import type { ContentPartSource } from '@tanstack/ai'
import type { TripoClientConfig, TripoTask } from './client'

/**
 * Options for `getTripoBalance()`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface GetTripoBalanceOptions extends TripoClientConfig {
  abortSignal?: AbortSignal
}

/**
 * Gets the credits of the Tripo account that owns the API key. `balance` is
 * the credits you can spend. `frozen` is the credits that Tripo holds for
 * tasks that are still running.
 *
 * @param options - The client settings (API key, base URL, headers, `fetch`)
 * and an optional `abortSignal`.
 * @throws {TripoApiError} When Tripo answers with a status that is not 2xx,
 * or with a body whose `code` is not `0`.
 *
 * @example
 * const { balance, frozen } = await getTripoBalance()
 *
 * @experimental Tripo support is experimental and may change.
 */
export async function getTripoBalance(options?: GetTripoBalanceOptions) {
  const client = createTripoClient(options)
  const body = await client.get<{ balance: number; frozen: number }>(
    '/account/balance',
    { signal: options?.abortSignal },
  )
  return { balance: body.balance, frozen: body.frozen }
}

/**
 * Options for `checkTripoRig()`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface CheckTripoRigOptions extends TripoClientConfig {
  /** The time between status checks, in ms. Defaults to 2000. */
  pollInterval?: number
  /** Stops the polling. Use `AbortSignal.timeout(ms)` to set a time limit. */
  abortSignal?: AbortSignal
}

/**
 * The result of `checkTripoRig()`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface CheckTripoRigResult {
  /** `true` when Tripo can rig the model. */
  riggable: boolean
  /**
   * The rig type that Tripo recommends, for example `biped`, `quadruped`,
   * `hexapod`, `octopod`, `avian`, `serpentine`, or `aquatic`.
   */
  rigType?: string
}

// Waits `ms`, or rejects with the abort reason when `signal` aborts first.
// ponytail: same `sleep` as ai-meshy/src/helpers.ts. Neither package exports
// it. Move it to ai-utils when a third adapter needs it.
function sleep(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Runs one Tripo request. An abort throws `signal.reason`, the same error
// that the poll wait throws, so the caller sees one abort error in every
// phase. Other request errors stay as they are.
async function abortable<T>(
  signal: AbortSignal | undefined,
  request: () => Promise<T>,
) {
  signal?.throwIfAborted()
  try {
    return await request()
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    throw error
  }
}

/**
 * Checks if Tripo can rig a 3D model, and which rig type it recommends. It
 * starts a Tripo rig-check task, waits until the task is done, and returns
 * the result.
 *
 * This function has no time limit. It polls until the task succeeds or fails.
 * To set a limit, pass `abortSignal: AbortSignal.timeout(ms)`.
 *
 * @param source - The model. A `url` source is a public GLB, FBX, OBJ, or STL
 * link. A `file` source is a Tripo task id or `file_token`, for example a
 * `jobId` from `tripo3dModel()`. A `data` source is uploaded to Tripo first.
 * @param options - `pollInterval`, `abortSignal`, and the client settings.
 * @throws {Error} When the task fails, with a message that starts with
 * `tripo: `.
 * @throws {TripoApiError} When Tripo answers with a status that is not 2xx,
 * or with a body whose `code` is not `0`.
 * @throws The `abortSignal` reason when the signal aborts.
 *
 * @example
 * const { riggable, rigType } = await checkTripoRig(
 *   { type: 'file', value: job.jobId, provider: 'tripo' },
 *   { abortSignal: AbortSignal.timeout(120_000) },
 * )
 *
 * @experimental Tripo support is experimental and may change.
 */
export async function checkTripoRig(
  source: ContentPartSource,
  options?: CheckTripoRigOptions,
) {
  const signal = options?.abortSignal
  const pollInterval = options?.pollInterval ?? 2000
  const client = createTripoClient(options)
  const created = await abortable(signal, async () =>
    client.post<{ task_id: string }>(
      '/animations/rig-check',
      { input: await tripoInputFor(client, source, signal) },
      signal,
    ),
  )

  for (;;) {
    const task = await abortable(signal, () =>
      client.get<TripoTask>(`/tasks/${created.task_id}`, { signal }),
    )
    const { status, error } = mapTripoStatus(task)
    if (status === 'failed')
      throw new Error(`tripo: rig check failed: ${error}`)
    if (status === 'completed') {
      const riggable = task.output?.riggable
      if (typeof riggable !== 'boolean') {
        throw new Error(
          `tripo: rig check task ${task.task_id} succeeded with no result.`,
        )
      }
      const rigType = task.output?.rig_type
      const result: CheckTripoRigResult =
        rigType === undefined ? { riggable } : { riggable, rigType }
      return result
    }
    await sleep(pollInterval, signal)
  }
}

/**
 * Options for `uploadTripoFile()`.
 *
 * @experimental Tripo support is experimental and may change.
 */
export interface UploadTripoFileOptions extends TripoClientConfig {
  abortSignal?: AbortSignal
}

/**
 * Uploads a file to Tripo and returns its `file_token`. Pass the token as a
 * `{ type: 'file', value: token, provider: 'tripo' }` source to reuse the
 * file in more than one request.
 *
 * @param file - The file. Its `type` must be a MIME type that Tripo accepts:
 * PNG, JPEG, or WebP images, or GLB, glTF, STL, or OBJ models.
 * @param options - The client settings and an optional `abortSignal`.
 * @throws {Error} When the file type is not one that Tripo accepts, before
 * any request.
 * @throws {TripoApiError} When Tripo answers with a status that is not 2xx,
 * or with a body whose `code` is not `0`.
 *
 * @example
 * const token = await uploadTripoFile(
 *   new Blob([bytes], { type: 'image/png' }),
 * )
 *
 * @experimental Tripo support is experimental and may change.
 */
export async function uploadTripoFile(
  file: Blob,
  options?: UploadTripoFileOptions,
) {
  return createTripoClient(options).upload(file, options?.abortSignal)
}
