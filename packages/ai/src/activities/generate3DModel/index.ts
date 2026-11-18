/**
 * 3D Model Activity (Experimental)
 *
 * Turns text, images, or an existing mesh into a 3D model file (GLB and
 * others). Adapters use a job API: create a job, poll its status, then read
 * the finished model.
 *
 * @experimental 3D model generation is experimental and may change.
 */

import { EventType } from '@ag-ui/core'
import { toRunErrorPayload } from '../error-payload'
import { resolveDebugOption } from '../../logger/resolve'
import { assertPromptFileSourceSupport } from '../../utilities/content-source'
import { normalizeStreamChunk } from '../../utilities/normalize-stream-chunk'
import {
  applyGenerationResultTransforms,
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware/run'
import {
  abortReasonMessage,
  createActivityAbortControls,
  isActivityAbortError,
  raceWithAbort,
  toAbortError,
} from '../../utilities/activity-abort'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type {
  GenerationMiddleware,
  GenerationMiddlewareContext,
} from '../middleware/types'
import type { Model3DAdapter } from './adapter'
import type {
  MediaPrompt,
  MediaPromptFor,
  Model3DJobResult,
  Model3DResult,
  Model3DStatusResult,
  StreamChunk,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = '3dModel' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a Model3DAdapter via ~types.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export type Model3DProviderOptions<TAdapter> =
  TAdapter extends Model3DAdapter<any, any, any, any>
    ? TAdapter['~types']['providerOptions']
    : object

/**
 * Extract the prompt type a model accepts from a Model3DAdapter via ~types.
 * Models in the adapter's input-modality map get a `prompt` narrowed to text
 * plus their supported part types. Adapters without a map get the full
 * MediaPrompt.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export type Model3DPromptForAdapter<TAdapter> =
  TAdapter extends Model3DAdapter<infer TModel, any, any, infer ModsByName>
    ? string extends keyof ModsByName
      ? MediaPrompt
      : TModel extends keyof ModsByName
        ? MediaPromptFor<ModsByName[TModel][number]>
        : MediaPrompt
    : MediaPrompt

// ===========================
// Activity Options Types
// ===========================

/**
 * Options shared by every 3D model call mode.
 * The model is read from the adapter's model property.
 */
interface Model3DActivityBaseOptions<
  TAdapter extends Model3DAdapter<string, any, any, any>,
> {
  /** The 3D model adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /**
   * What to make: a plain string for text-to-3D, or an ordered array of text,
   * image, and `model3d` parts. The accepted part types are narrowed per
   * model by the adapter's input-modality map.
   */
  prompt: Model3DPromptForAdapter<TAdapter>
  /** Provider-specific options for 3D model generation */
  modelOptions?: Model3DProviderOptions<TAdapter>
  /**
   * Stable conversation/thread id. Required. It is the `threadId` on the
   * emitted `RUN_STARTED` / `RUN_FINISHED` chunks and on the middleware
   * context.
   */
  threadId: string
  /** Stable run id. A new one is made when you do not set it. */
  runId?: string
  /** Time between two status polls, in milliseconds (`stream` and `wait` only). @default 2000 */
  pollInterval?: number
  /**
   * Maximum duration of this call, in milliseconds. Composed with
   * {@link abortSignal}; the first abort wins.
   *
   * In `stream` and `wait` modes it bounds the full create → poll → complete
   * lifecycle and defaults to 10 minutes. When it fires, the activity asks
   * the adapter to cancel the job. In submit mode it bounds only the submit
   * request and has no default.
   */
  timeout?: number
  /**
   * Caller cancellation signal. Composed with {@link timeout} and given to
   * every adapter request. An abort after the job exists asks the adapter
   * to cancel the job.
   */
  abortSignal?: AbortSignal
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for
   * granular control and/or a custom `Logger`.
   */
  debug?: DebugOption
  /**
   * Observe-only middleware notified on start, usage, success, and error.
   * Pass `otelMiddleware()` to emit OpenTelemetry spans, or implement the
   * `GenerationMiddleware` contract for a custom backend.
   *
   * In `stream` and `wait` modes one run covers the full lifecycle. In
   * submit mode the run covers only the submit request.
   */
  middleware?: Array<GenerationMiddleware>
}

/**
 * Options for {@link generate3DModel}.
 *
 * - No `stream` and no `wait`: submit the job and return `{ jobId, model }`.
 * - `stream: true`: run the full job and return StreamChunks (for SSE).
 * - `wait: true`: run the full job and return the finished model.
 *
 * `stream` and `wait` cannot both be `true`.
 *
 * @template TAdapter - The 3D model adapter type
 * @template TStream - Whether to stream the job lifecycle
 * @template TWait - Whether to wait for the finished model
 *
 * @experimental 3D model generation is experimental and may change.
 */
export type Model3DActivityOptions<
  TAdapter extends Model3DAdapter<string, any, any, any>,
  TStream extends boolean = false,
  TWait extends boolean = false,
> = Model3DActivityBaseOptions<TAdapter> & {
  /**
   * Run the full job and return an AsyncIterable<StreamChunk>: RUN_STARTED,
   * one `generation:progress` per poll, `generation:result`, RUN_FINISHED.
   *
   * @default false
   */
  stream?: TStream
  /**
   * Run the full job and return a Promise of the finished model.
   *
   * @default false
   */
  wait?: TWait
} & ([TStream, TWait] extends [true, true] ? { wait: never } : unknown)

// ===========================
// Activity Result Types
// ===========================

/**
 * Result type for {@link generate3DModel}:
 * - `stream: true`: AsyncIterable<StreamChunk>
 * - `wait: true`: Promise<Model3DResult>
 * - otherwise: Promise<Model3DJobResult>
 *
 * @experimental 3D model generation is experimental and may change.
 */
export type Model3DActivityResult<
  TStream extends boolean = false,
  TWait extends boolean = false,
> = TStream extends true
  ? AsyncIterable<StreamChunk>
  : TWait extends true
    ? Promise<Model3DResult>
    : Promise<Model3DJobResult>

// ===========================
// Activity Implementation
// ===========================

const DEFAULT_POLL_INTERVAL_MS = 2000
const DEFAULT_TIMEOUT_MS = 600_000

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Generate a 3D model from text, images, or an existing mesh.
 *
 * Generation is a job. With no flag, the call submits the job and returns
 * `{ jobId, model }`; read it later with {@link get3DModelJobStatus}. With
 * `wait: true`, the call polls until the job is done and returns the model.
 * With `stream: true`, the call returns StreamChunks for the same lifecycle,
 * so you can send them to the client over SSE.
 *
 * A job that fails rejects (or ends the stream with RUN_ERROR) with the
 * provider error message. On timeout or abort, the activity asks the adapter
 * to cancel the job.
 *
 * @example Wait for the model on the server
 * ```ts
 * import { generate3DModel } from '@tanstack/ai'
 * import { fal3DModel } from '@tanstack/ai-fal'
 *
 * const model = await generate3DModel({
 *   adapter: fal3DModel('fal-ai/hunyuan3d-v3/image-to-3d'),
 *   prompt: [{ type: 'image', source: { type: 'url', value: conceptArtUrl } }],
 *   threadId,
 *   wait: true,
 * })
 *
 * console.log(model.url, model.format) // e.g. 'https://…/model.glb', 'glb'
 * ```
 *
 * @example Stream the job to the client
 * ```ts
 * import { generate3DModel, toServerSentEventsResponse } from '@tanstack/ai'
 * import { fal3DModel } from '@tanstack/ai-fal'
 *
 * const stream = generate3DModel({
 *   adapter: fal3DModel('fal-ai/hunyuan3d-v3/image-to-3d'),
 *   prompt: [{ type: 'image', source: { type: 'url', value: conceptArtUrl } }],
 *   threadId,
 *   stream: true,
 * })
 *
 * return toServerSentEventsResponse(stream)
 * ```
 *
 * @experimental 3D model generation is experimental and may change.
 */
export function generate3DModel<
  TAdapter extends Model3DAdapter<string, any, any, any>,
  TStream extends boolean = false,
  TWait extends boolean = false,
>(
  options: Model3DActivityOptions<TAdapter, TStream, TWait>,
): Model3DActivityResult<TStream, TWait> {
  if (options.stream) {
    return stream3DModel(options) as Model3DActivityResult<TStream, TWait>
  }
  if (options.wait) {
    return wait3DModel(options) as Model3DActivityResult<TStream, TWait>
  }
  return submit3DModelJob(options) as Model3DActivityResult<TStream, TWait>
}

function contextFor(
  options: Model3DActivityBaseOptions<Model3DAdapter<string, any, any, any>>,
  runId: string | undefined,
  signal: AbortSignal | undefined,
): GenerationMiddlewareContext {
  return createGenerationContext({
    requestId: createId('3d-model'),
    signal,
    activity: '3dModel',
    provider: options.adapter.name,
    model: options.adapter.model,
    modelOptions: options.modelOptions,
    threadId: options.threadId,
    runId,
    artifactInputs: { prompt: options.prompt },
    createId,
  })
}

function createJob(
  options: Model3DActivityBaseOptions<Model3DAdapter<string, any, any, any>>,
  logger: InternalLogger,
  signal: AbortSignal | undefined,
) {
  const { adapter } = options
  logger.request(`activity=generate3DModel provider=${adapter.name}`, {
    provider: adapter.name,
    model: adapter.model,
  })
  return raceWithAbort(
    adapter.create3DModelJob({
      model: adapter.model,
      prompt: options.prompt,
      modelOptions: options.modelOptions,
      logger,
      ...(signal ? { abortSignal: signal } : {}),
    }),
    signal,
  )
}

/** Fire `onAbort` for a caller abort or timeout, else `onError`. */
async function reportFailure(
  middleware: Array<GenerationMiddleware> | undefined,
  ctx: GenerationMiddlewareContext,
  error: unknown,
  signal: AbortSignal | undefined,
  startTime: number,
) {
  const duration = Date.now() - startTime
  if (isActivityAbortError(error, signal)) {
    await runGenerationAbort(middleware, ctx, {
      reason: abortReasonMessage(error, signal),
      duration,
    })
    return
  }
  await runGenerationError(middleware, ctx, { error, duration })
}

/**
 * Submit mode: create the job and return its id. The middleware run covers
 * only the submit request.
 */
async function submit3DModelJob(
  options: Model3DActivityBaseOptions<Model3DAdapter<string, any, any, any>>,
) {
  assertPromptFileSourceSupport(options.adapter, options.prompt)
  const { middleware } = options
  const logger = resolveDebugOption(options.debug)
  const startTime = Date.now()
  const abortControls = createActivityAbortControls({
    timeout: options.timeout,
    abortSignal: options.abortSignal,
  })
  const ctx = contextFor(options, options.runId, abortControls.signal)

  await runGenerationStart(middleware, ctx)
  try {
    const job = await createJob(options, logger, abortControls.signal)
    abortControls.clear()
    logger.output(`activity=generate3DModel jobId=${job.jobId}`, {
      jobId: job.jobId,
      model: job.model,
    })
    const result = await applyGenerationResultTransforms(ctx, job)
    await runGenerationFinish(middleware, ctx, {
      duration: Date.now() - startTime,
    })
    return result
  } catch (error) {
    abortControls.clear()
    await reportFailure(middleware, ctx, error, abortControls.signal, startTime)
    logger.errors('generate3DModel activity failed', {
      error,
      source: 'generate3DModel',
    })
    throw error
  }
}

/** Wait the given time. An abort rejects at once and clears the timer. */
function sleep(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError(signal.reason))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(toAbortError(signal?.reason))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Ask the provider to stop the job. Best effort: a failure is only logged. */
function cancelJob(
  adapter: Model3DAdapter<string, any, any, any>,
  jobId: string,
  logger: InternalLogger,
) {
  void (async () => adapter.cancel3DModelJob?.(jobId))().catch(
    (error: unknown) =>
      logger.errors('generate3DModel cancel3DModelJob failed', {
        jobId,
        error,
        source: 'generate3DModel',
      }),
  )
}

type Model3DJobEvent =
  | { type: 'status'; status: Model3DStatusResult }
  | { type: 'result'; result: Model3DResult }

/**
 * The full job lifecycle that `wait` and `stream` share: create the job,
 * yield each polled status, then yield the finished model. One middleware
 * run covers the lifecycle. A failed job throws the provider message. A
 * timeout, an abort, or a consumer that stops reading cancels the job.
 */
async function* run3DModelJob(
  options: Model3DActivityBaseOptions<Model3DAdapter<string, any, any, any>>,
  runId: string,
): AsyncGenerator<Model3DJobEvent> {
  assertPromptFileSourceSupport(options.adapter, options.prompt)
  const { adapter, middleware } = options
  const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS
  const logger = resolveDebugOption(options.debug)
  const startTime = Date.now()
  const abortControls = createActivityAbortControls({
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    abortSignal: options.abortSignal,
  })
  const signal = abortControls.signal
  const signalOptions = signal ? { abortSignal: signal } : undefined
  const ctx = contextFor(options, runId, signal)

  await runGenerationStart(middleware, ctx)

  // True once a terminal middleware hook fired. The `finally` uses it to
  // tell a consumer that stopped reading from a run that already ended.
  let settled = false
  let jobId: string | undefined
  try {
    const job = await createJob(options, logger, signal)
    jobId = job.jobId

    let status: Model3DStatusResult
    do {
      await sleep(pollInterval, signal)
      status = await raceWithAbort(
        adapter.get3DModelStatus(job.jobId, signalOptions),
        signal,
      )
      yield { type: 'status', status }
      if (status.status === 'failed') {
        throw new Error(status.error || '3D model generation failed')
      }
    } while (status.status !== 'completed')

    const model = await raceWithAbort(
      adapter.get3DModel(job.jobId, signalOptions),
      signal,
    )
    const result = await applyGenerationResultTransforms(ctx, model)
    logger.output(
      `activity=generate3DModel jobId=${job.jobId} status=completed`,
      { jobId: job.jobId, url: result.url },
    )

    if (result.usage) await runGenerationUsage(middleware, ctx, result.usage)
    await runGenerationFinish(middleware, ctx, {
      duration: Date.now() - startTime,
      usage: result.usage,
    })
    settled = true
    yield { type: 'result', result }
  } catch (error) {
    // Set before the hooks run, so a hook that throws does not make the
    // `finally` fire `onAbort` for the same run.
    settled = true
    // Cancel only on a real caller abort or timeout. A provider error named
    // `TimeoutError` does not mean the caller wants the job stopped.
    if (jobId !== undefined && signal?.aborted) {
      cancelJob(adapter, jobId, logger)
    }
    await reportFailure(middleware, ctx, error, signal, startTime)
    logger.errors('generate3DModel activity failed', {
      error,
      source: 'generate3DModel',
    })
    throw error
  } finally {
    abortControls.clear()
    if (!settled) {
      // The consumer stopped reading before the job finished.
      if (jobId !== undefined) cancelJob(adapter, jobId, logger)
      await runGenerationAbort(middleware, ctx, {
        reason: '3D model generation stopped before completion',
        duration: Date.now() - startTime,
      })
    }
  }
}

/** Wait mode: run the full job and return the finished model. */
async function wait3DModel(
  options: Model3DActivityBaseOptions<Model3DAdapter<string, any, any, any>>,
) {
  const events = run3DModelJob(options, options.runId ?? createId('run'))
  for await (const event of events) {
    if (event.type === 'result') return event.result
  }
  throw new Error('3D model generation ended without a result')
}

/** Stream mode: run the full job as AG-UI StreamChunks. */
async function* stream3DModel(
  options: Model3DActivityBaseOptions<Model3DAdapter<string, any, any, any>>,
): AsyncIterable<StreamChunk> {
  const runId = options.runId ?? createId('run')
  const threadId = options.threadId

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }

  try {
    const events = run3DModelJob(options, runId)
    for await (const event of events) {
      if (event.type === 'status') {
        const { status } = event
        yield {
          type: EventType.CUSTOM,
          name: 'generation:progress',
          value: {
            progress:
              status.progress ?? (status.status === 'completed' ? 100 : 0),
            message: status.status,
          },
          timestamp: Date.now(),
        }
        continue
      }

      const { result } = event
      yield {
        type: EventType.CUSTOM,
        name: 'generation:result',
        value: result,
        timestamp: Date.now(),
      }
      yield* normalizeStreamChunk({
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        finishReason: 'stop',
        timestamp: Date.now(),
        ...(result.usage ? { usage: result.usage } : {}),
      })
    }
  } catch (error: unknown) {
    const payload = toRunErrorPayload(error, '3D model generation failed')
    yield* normalizeStreamChunk({
      type: EventType.RUN_ERROR,
      runId,
      threadId,
      message: payload.message,
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      timestamp: Date.now(),
    })
  }
}

// ===========================
// Job Status
// ===========================

/**
 * Options for {@link get3DModelJobStatus}.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export interface Model3DJobStatusOptions<
  TAdapter extends Model3DAdapter<string, any, any, any>,
> {
  /** The 3D model adapter that created the job */
  adapter: TAdapter & { kind: typeof kind }
  /** The job id that {@link generate3DModel} returned */
  jobId: string
  /** Caller cancellation signal, given to the adapter requests */
  abortSignal?: AbortSignal
}

/**
 * The status of a 3D model job, plus the finished model once the job is
 * completed.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export interface Model3DJobStatusResult extends Model3DStatusResult {
  /** The finished model. Set only when `status` is `'completed'`. */
  result?: Model3DResult
}

/**
 * Read the status of a 3D model job that {@link generate3DModel} submitted.
 * When the job is completed, it also reads the finished model.
 *
 * It runs no middleware. To observe the full lifecycle, use `wait: true` or
 * `stream: true` on {@link generate3DModel}.
 *
 * @example Poll a submitted job
 * ```ts
 * import { generate3DModel, get3DModelJobStatus } from '@tanstack/ai'
 * import { fal3DModel } from '@tanstack/ai-fal'
 *
 * const adapter = fal3DModel('fal-ai/hunyuan3d-v3/image-to-3d')
 * const { jobId } = await generate3DModel({ adapter, prompt, threadId })
 *
 * const status = await get3DModelJobStatus({ adapter, jobId })
 * if (status.result) console.log(status.result.url)
 * ```
 *
 * @experimental 3D model generation is experimental and may change.
 */
export async function get3DModelJobStatus<
  TAdapter extends Model3DAdapter<string, any, any, any>,
>(options: Model3DJobStatusOptions<TAdapter>) {
  const { adapter, jobId, abortSignal } = options
  const signalOptions = abortSignal ? { abortSignal } : undefined
  const status: Model3DJobStatusResult = await raceWithAbort(
    adapter.get3DModelStatus(jobId, signalOptions),
    abortSignal,
  )
  if (status.status !== 'completed') return status

  const result = await raceWithAbort(
    adapter.get3DModel(jobId, signalOptions),
    abortSignal,
  )
  return { ...status, result }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generate3DModel() function without running it.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export function create3DModelOptions<
  TAdapter extends Model3DAdapter<string, any, any, any>,
  TStream extends boolean = false,
  TWait extends boolean = false,
>(options: Model3DActivityOptions<TAdapter, TStream, TWait>) {
  return options
}

// Re-export adapter types
export type {
  Model3DAdapter,
  Model3DAdapterConfig,
  AnyModel3DAdapter,
} from './adapter'
export { BaseModel3DAdapter } from './adapter'
