/**
 * Motion Activity (Experimental)
 *
 * Generates skeletal animation assets (FBX, BVH, GLB, ...) from a text
 * prompt. Provider jobs are long-running, so the API is job-shaped:
 *
 * - `generateMotion()` submits a job, or with `stream: true` submits it and
 *   streams its status until the assets are ready.
 * - `getMotionJobStatus()` polls a job by id, from any request.
 * - `cancelMotionJob()` asks the provider to stop the job.
 *
 * Stopping local observation (abort, timeout, closing the stream) never
 * cancels the provider job. Call `cancelMotionJob()` for that.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { toRunErrorPayload } from '../error-payload'
import { resolveDebugOption } from '../../logger/resolve'
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
  sleep,
} from '../../utilities/activity-abort'
import { normalizeStreamChunk } from '../../utilities/normalize-stream-chunk'
import type { AdapterYieldChunk } from '../../utilities/adapter-yield-chunk'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type {
  GenerationMiddleware,
  GenerationMiddlewareContext,
} from '../middleware/types'
import type { AnyMotionAdapter, MotionAdapter } from './adapter'
import type {
  MotionGenerationResult,
  MotionJobResult,
  MotionJobState,
  StreamChunk,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'motion' as const

/** Custom stream event names emitted by `generateMotion({ stream: true })`. */
export const MOTION_EVENTS = {
  /** `{ jobId, model }` once the provider accepted the job */
  JOB_CREATED: 'motion:job:created',
  /** `{ jobId, status, progress?, queuePosition?, error? }` on every poll */
  STATUS: 'motion:status',
} as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract provider options from a MotionAdapter via ~types. */
export type MotionProviderOptions<TAdapter> = TAdapter extends {
  '~types': { providerOptions: infer P extends object }
}
  ? P
  : object

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for {@link generateMotion}.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export interface MotionActivityOptions<
  TAdapter extends MotionAdapter<string, MotionProviderOptions<TAdapter>>,
  TStream extends boolean = false,
> {
  /** The motion adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Natural-language description of the motion */
  prompt: string
  /**
   * Requested clip length in seconds. The provider decides the accepted
   * range and rejects values outside it.
   */
  duration?: number
  /** Provider-specific options for motion generation */
  modelOptions?: MotionProviderOptions<TAdapter>
  /**
   * `false` (default): submit the job and return `{ jobId, model }`. Poll
   * it later with {@link getMotionJobStatus}.
   *
   * `true`: return an `AsyncIterable<StreamChunk>` that submits the job,
   * polls it, and ends with `generation:result` and `RUN_FINISHED`.
   */
  stream?: TStream
  /** Polling interval in milliseconds (stream mode only). @default 2000 */
  pollingInterval?: number
  /** Stop polling after this many milliseconds (stream mode only). @default 600000 */
  maxDuration?: number
  /** Stable conversation/thread id. Also the AG-UI thread id on the stream. */
  threadId: string
  /**
   * Run id for the stream chunks (stream mode only). A non-streaming submit
   * ignores it: that run id is derived from the provider job, so
   * {@link getMotionJobStatus} can find the same run from the job id alone.
   */
  runId?: string
  /** Enable debug logging. See `DebugOption`. */
  debug?: DebugOption
  /**
   * Observe-only middleware (`otelMiddleware()`, persistence, custom).
   *
   * Stream mode: one run from submit to result.
   * Submit mode: the submit opens the run, and the {@link getMotionJobStatus}
   * poll that sees a terminal state closes it. Pass the same `middleware`
   * and `threadId` to both.
   */
  middleware?: Array<GenerationMiddleware>
  /**
   * Maximum time for this call in milliseconds. In stream mode it bounds the
   * whole observation. Reaching it stops observation, not the provider job.
   */
  timeout?: number
  /**
   * Caller cancellation signal. It stops local observation only. The
   * provider job keeps running. Use {@link cancelMotionJob} to stop it.
   */
  abortSignal?: AbortSignal
}

/**
 * Result type for {@link generateMotion}.
 * - `stream: true`: `AsyncIterable<StreamChunk>`
 * - otherwise: `Promise<MotionJobResult>`
 */
export type MotionActivityResult<TStream extends boolean = false> =
  TStream extends true ? AsyncIterable<StreamChunk> : Promise<MotionJobResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * The run id a non-streaming motion job is filed under. Both the submit and
 * the poll derive it from provider + job id, so no state has to cross the
 * request boundary. Same rule as video.
 */
function motionRunIdForJob(provider: string, jobId: string): string {
  return `motion:${encodeURIComponent(provider)}:${encodeURIComponent(jobId)}`
}

function emitMotionError(
  base: {
    requestId: string
    provider: string
    model: string
    requestType: 'create' | 'status'
    threadId?: string
    runId?: string
    jobId?: string
  },
  error: unknown,
  startTime: number,
) {
  const err = error instanceof Error ? error : new Error(String(error))
  aiEventClient.emit('motion:request:error', {
    ...base,
    error: { message: err.message, name: err.name },
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  })
}

// ===========================
// Activity Implementation
// ===========================

/**
 * Generate a skeletal motion from a text prompt.
 *
 * @example Submit, then poll from a later request
 * ```ts
 * import { generateMotion, getMotionJobStatus } from '@tanstack/ai'
 * import { falMotion } from '@tanstack/ai-fal'
 *
 * const adapter = falMotion('fal-ai/hunyuan-motion')
 * const { jobId } = await generateMotion({
 *   adapter,
 *   threadId: 'orc-attacks',
 *   prompt: 'A heavy two-handed overhead axe swing with a slow wind-up',
 *   duration: 3,
 * })
 *
 * const status = await getMotionJobStatus({ adapter, jobId })
 * if (status.motion) console.log(status.motion.assets[0]?.url)
 * ```
 *
 * @example Stream the whole lifecycle to a browser
 * ```ts
 * const stream = generateMotion({
 *   adapter: falMotion('fal-ai/hunyuan-motion'),
 *   threadId: 'orc-attacks',
 *   prompt: 'A heavy two-handed overhead axe swing',
 *   stream: true,
 * })
 * return toServerSentEventsResponse(stream)
 * ```
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export function generateMotion<
  TAdapter extends MotionAdapter<string, MotionProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: MotionActivityOptions<TAdapter, TStream>,
): MotionActivityResult<TStream> {
  if (options.stream) {
    return runStreamingMotion(options) as MotionActivityResult<TStream>
  }
  return runCreateMotionJob(options) as MotionActivityResult<TStream>
}

function providerNameOf(adapter: { name?: string }): string {
  return (
    (adapter as { provider?: string }).provider ?? adapter.name ?? 'unknown'
  )
}

/**
 * Submit only. Opens the middleware run under the job-derived run id; the
 * poll that sees a terminal state closes it. A failed submit has no job, so
 * it opens and fails a run under this call's request id.
 */
async function runCreateMotionJob<
  TAdapter extends MotionAdapter<string, MotionProviderOptions<TAdapter>>,
>(options: MotionActivityOptions<TAdapter, boolean>): Promise<MotionJobResult> {
  const { adapter, prompt, duration, modelOptions, middleware, threadId } =
    options
  const model = adapter.model
  const requestId = createId('motion')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout: options.timeout,
    abortSignal: options.abortSignal,
  })
  const eventBase = {
    requestId,
    provider: adapter.name,
    model,
    requestType: 'create' as const,
    threadId,
  }

  const contextFor = (runId?: string): GenerationMiddlewareContext =>
    createGenerationContext({
      requestId,
      signal: abortControls.signal,
      activity: 'motion',
      provider: adapter.name,
      model,
      modelOptions,
      threadId,
      runId,
      artifactInputs: { prompt },
      createId,
    })

  aiEventClient.emit('motion:request:started', {
    ...eventBase,
    prompt,
    timestamp: startTime,
    ...(modelOptions !== undefined && {
      modelOptions: modelOptions as Record<string, unknown>,
    }),
  })
  logger.request(
    `activity=generateMotion provider=${providerNameOf(adapter)}`,
    {
      provider: providerNameOf(adapter),
      model,
    },
  )

  let job: MotionJobResult
  try {
    job = await raceWithAbort(
      adapter.createMotionJob({
        model,
        prompt,
        ...(duration !== undefined ? { duration } : {}),
        ...(modelOptions !== undefined ? { modelOptions } : {}),
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    abortControls.clear()
  } catch (error) {
    abortControls.clear()
    const failedCtx = contextFor()
    await runGenerationStart(middleware, failedCtx)
    const elapsed = Date.now() - startTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, failedCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsed,
      })
    } else {
      await runGenerationError(middleware, failedCtx, {
        error,
        duration: elapsed,
      })
    }
    emitMotionError(eventBase, error, startTime)
    logger.errors('generateMotion activity failed', {
      error,
      source: 'generateMotion',
    })
    throw error
  }

  aiEventClient.emit('motion:request:completed', {
    ...eventBase,
    jobId: job.jobId,
    status: 'pending',
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  })
  logger.output(`activity=generateMotion jobId=${job.jobId}`, {
    jobId: job.jobId,
    model: job.model,
  })

  const mwCtx = contextFor(motionRunIdForJob(adapter.name, job.jobId))
  await runGenerationStart(middleware, mwCtx)
  return await applyGenerationResultTransforms(mwCtx, job)
}

/**
 * Submit, poll, and stream until the motion is ready.
 *
 * Abort, timeout, and an abandoned stream end the run as aborted and leave
 * the provider job running. The `motion:job:created` chunk carries the job
 * id, so the caller can poll or cancel it later.
 */
async function* runStreamingMotion<
  TAdapter extends MotionAdapter<string, MotionProviderOptions<TAdapter>>,
>(
  options: MotionActivityOptions<TAdapter, boolean>,
): AsyncIterable<StreamChunk> {
  const { adapter, prompt, duration, modelOptions, middleware, threadId } =
    options
  const model = adapter.model
  const runId = options.runId ?? createId('run')
  const requestId = createId('motion')
  const startTime = Date.now()
  const pollingInterval = options.pollingInterval ?? 2000
  const maxDuration = options.maxDuration ?? 600_000
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout: options.timeout,
    abortSignal: options.abortSignal,
  })
  const signalOptions = abortControls.signal
    ? { abortSignal: abortControls.signal }
    : undefined
  const eventBase = {
    requestId,
    provider: adapter.name,
    model,
    requestType: 'create' as const,
    threadId,
    runId,
  }

  yield {
    type: 'RUN_STARTED',
    runId,
    threadId,
    timestamp: Date.now(),
  } as StreamChunk

  const mwCtx = createGenerationContext({
    requestId,
    signal: abortControls.signal,
    activity: 'motion',
    provider: adapter.name,
    model,
    modelOptions,
    threadId,
    runId,
    artifactInputs: { prompt },
    createId,
  })
  await runGenerationStart(middleware, mwCtx)

  aiEventClient.emit('motion:request:started', {
    ...eventBase,
    prompt,
    timestamp: startTime,
    ...(modelOptions !== undefined && {
      modelOptions: modelOptions as Record<string, unknown>,
    }),
  })
  logger.request(
    `activity=generateMotion provider=${providerNameOf(adapter)} stream=true`,
    { provider: providerNameOf(adapter), model },
  )

  // Set once a terminal middleware hook fired, so `finally` does not report
  // an abandoned stream on top of it.
  let settled = false
  let jobId: string | undefined
  try {
    const job = await raceWithAbort(
      adapter.createMotionJob({
        model,
        prompt,
        ...(duration !== undefined ? { duration } : {}),
        ...(modelOptions !== undefined ? { modelOptions } : {}),
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )
    jobId = job.jobId

    yield {
      type: 'CUSTOM',
      name: MOTION_EVENTS.JOB_CREATED,
      value: { jobId: job.jobId, model: job.model },
      timestamp: Date.now(),
    }

    const pollStart = Date.now()
    let first = true
    while (Date.now() - pollStart < maxDuration) {
      // Poll at once: a provider that finished synchronously needs no wait.
      if (!first) await sleep(pollingInterval, abortControls.signal)
      first = false

      const status = await raceWithAbort(
        adapter.getMotionStatus(job.jobId, signalOptions),
        abortControls.signal,
      )

      yield {
        type: 'CUSTOM',
        name: MOTION_EVENTS.STATUS,
        value: status,
        timestamp: Date.now(),
      }
      // Only a real provider number becomes progress. No estimate.
      if (status.progress !== undefined) {
        yield {
          type: 'CUSTOM',
          name: 'generation:progress',
          value: { progress: status.progress, message: status.status },
          timestamp: Date.now(),
        }
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Motion generation failed')
      }
      if (status.status !== 'completed') continue

      abortControls.signal?.throwIfAborted()
      const motion = await raceWithAbort(
        adapter.getMotion(job.jobId, signalOptions),
        abortControls.signal,
      )
      const result = await applyGenerationResultTransforms(mwCtx, motion)

      if (result.usage) {
        aiEventClient.emit('motion:usage', {
          requestId,
          threadId,
          runId,
          model,
          usage: result.usage,
          timestamp: Date.now(),
        })
        await runGenerationUsage(middleware, mwCtx, result.usage)
      }
      await runGenerationFinish(middleware, mwCtx, {
        duration: Date.now() - startTime,
        usage: result.usage,
      })
      settled = true
      abortControls.clear()
      aiEventClient.emit('motion:request:completed', {
        ...eventBase,
        jobId: job.jobId,
        status: 'completed',
        assetCount: result.assets.length,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })
      logger.output(`activity=generateMotion jobId=${job.jobId} completed`, {
        jobId: job.jobId,
        assets: result.assets.length,
      })

      yield {
        type: 'CUSTOM',
        name: 'generation:result',
        value: result,
        timestamp: Date.now(),
      }
      yield* normalizeStreamChunk({
        type: 'RUN_FINISHED',
        runId,
        threadId,
        finishReason: 'stop',
        timestamp: Date.now(),
        ...(result.usage ? { usage: result.usage } : {}),
      } as AdapterYieldChunk)
      return
    }

    throw new Error(
      `Motion generation did not finish within ${maxDuration} ms. Job ${job.jobId} may still be running.`,
    )
  } catch (error: unknown) {
    abortControls.clear()
    settled = true
    const elapsed = Date.now() - startTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsed,
      })
    } else {
      await runGenerationError(middleware, mwCtx, { error, duration: elapsed })
    }
    emitMotionError(
      { ...eventBase, ...(jobId !== undefined ? { jobId } : {}) },
      error,
      startTime,
    )
    const payload = toRunErrorPayload(error, 'Motion generation failed')
    logger.errors('generateMotion activity failed', {
      message: payload.message,
      code: payload.code,
      source: 'generateMotion',
    })
    yield* normalizeStreamChunk({
      type: 'RUN_ERROR',
      runId,
      threadId,
      message: payload.message,
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      timestamp: Date.now(),
    } as AdapterYieldChunk)
  } finally {
    abortControls.clear()
    if (!settled) {
      // The consumer stopped reading. Observation ends; the job does not.
      await runGenerationAbort(middleware, mwCtx, {
        reason: 'Motion stream closed before the job finished',
        duration: Date.now() - startTime,
      })
    }
  }
}

// ===========================
// Status
// ===========================

/**
 * Options for {@link getMotionJobStatus}.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export interface MotionJobStatusOptions<TAdapter extends AnyMotionAdapter> {
  /** The motion adapter (same provider and model as the submit) */
  adapter: TAdapter & { kind: typeof kind }
  /** The provider job id */
  jobId: string
  /** Must match the submit's `threadId` when middleware is used. */
  threadId?: string
  /**
   * Observe-only middleware. Hooks fire only on the poll that sees a
   * terminal state: it closes the run that the submit opened.
   */
  middleware?: Array<GenerationMiddleware>
  /** Maximum time for this call in milliseconds. */
  timeout?: number
  /** Cancels this HTTP call only. The job keeps running. */
  abortSignal?: AbortSignal
}

/**
 * Status of a motion job, plus the finished motion once it completed.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export interface MotionJobStatusResult {
  jobId: string
  status: MotionJobState
  progress?: number
  queuePosition?: number
  error?: string
  /** The finished motion, set when `status` is `completed` */
  motion?: MotionGenerationResult
}

/**
 * Read the status of a motion job. When the job completed, the result
 * includes the finished motion and its asset URLs.
 *
 * Safe to call from any request or process: the job id is the only state.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export async function getMotionJobStatus<TAdapter extends AnyMotionAdapter>(
  options: MotionJobStatusOptions<TAdapter>,
): Promise<MotionJobStatusResult> {
  const { adapter, jobId, middleware, threadId } = options
  const abortControls = createActivityAbortControls({
    timeout: options.timeout,
    abortSignal: options.abortSignal,
  })
  const signal = abortControls.signal
  const signalOptions = signal ? { abortSignal: signal } : undefined
  const requestId = createId('motion-status')
  const startTime = Date.now()
  const runId = motionRunIdForJob(adapter.name, jobId)
  const eventBase = {
    requestId,
    provider: adapter.name,
    model: adapter.model,
    requestType: 'status' as const,
    jobId,
    ...(threadId !== undefined ? { threadId } : {}),
    runId,
  }
  const terminalContext = (): GenerationMiddlewareContext =>
    createGenerationContext({
      requestId,
      signal,
      activity: 'motion',
      provider: adapter.name,
      model: adapter.model,
      threadId,
      runId,
      createId,
    })

  aiEventClient.emit('motion:request:started', {
    ...eventBase,
    timestamp: startTime,
  })

  try {
    const status = await raceWithAbort(
      adapter.getMotionStatus(jobId, signalOptions),
      signal,
    )
    const base: MotionJobStatusResult = {
      jobId,
      status: status.status,
      ...(status.progress !== undefined ? { progress: status.progress } : {}),
      ...(status.queuePosition !== undefined
        ? { queuePosition: status.queuePosition }
        : {}),
      ...(status.error !== undefined ? { error: status.error } : {}),
    }

    if (status.status === 'failed') {
      await runGenerationError(middleware, terminalContext(), {
        error: new Error(status.error || 'Motion generation failed'),
        duration: Date.now() - startTime,
      })
    }

    if (status.status !== 'completed') {
      aiEventClient.emit('motion:request:completed', {
        ...eventBase,
        status: status.status,
        ...(status.error !== undefined ? { error: status.error } : {}),
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })
      return base
    }

    let motion: MotionGenerationResult
    try {
      motion = await raceWithAbort(
        adapter.getMotion(jobId, signalOptions),
        signal,
      )
    } catch (error) {
      // A cancelled call says nothing about the job.
      if (signal?.aborted) throw error
      // Completed but the result cannot be read: the job is terminal, so
      // close the run as failed.
      await runGenerationError(middleware, terminalContext(), {
        error,
        duration: Date.now() - startTime,
      })
      const message =
        error instanceof Error ? error.message : 'Failed to fetch motion'
      aiEventClient.emit('motion:request:completed', {
        ...eventBase,
        status: 'failed',
        error: message,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })
      return { ...base, status: 'failed', error: message }
    }

    const mwCtx = terminalContext()
    await runGenerationStart(middleware, mwCtx)
    const result = await applyGenerationResultTransforms(mwCtx, motion)
    if (result.usage) {
      aiEventClient.emit('motion:usage', {
        requestId,
        runId,
        ...(threadId !== undefined ? { threadId } : {}),
        model: adapter.model,
        usage: result.usage,
        timestamp: Date.now(),
      })
      await runGenerationUsage(middleware, mwCtx, result.usage)
    }
    await runGenerationFinish(middleware, mwCtx, {
      duration: Date.now() - startTime,
      usage: result.usage,
    })
    aiEventClient.emit('motion:request:completed', {
      ...eventBase,
      status: 'completed',
      assetCount: result.assets.length,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })
    return { ...base, motion: result }
  } catch (error) {
    emitMotionError(eventBase, error, startTime)
    throw error
  } finally {
    abortControls.clear()
  }
}

// ===========================
// Cancel
// ===========================

/**
 * Options for {@link cancelMotionJob}.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export interface CancelMotionJobOptions<TAdapter extends AnyMotionAdapter> {
  adapter: TAdapter & { kind: typeof kind }
  jobId: string
  /** Cancels this HTTP call only. */
  abortSignal?: AbortSignal
}

/**
 * Ask the provider to stop a motion job. This is a remote cancel, not a
 * local stop. Providers decide what happens: a queued job is usually
 * removed, a running job may still finish.
 *
 * @throws When the adapter's provider has no cancel API.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export async function cancelMotionJob<TAdapter extends AnyMotionAdapter>(
  options: CancelMotionJobOptions<TAdapter>,
): Promise<void> {
  const { adapter, jobId, abortSignal } = options
  if (!adapter.cancelMotionJob) {
    throw new Error(
      `The ${adapter.name} motion adapter cannot cancel jobs: the provider has no cancel API.`,
    )
  }
  await adapter.cancelMotionJob(
    jobId,
    abortSignal ? { abortSignal } : undefined,
  )
}

// ===========================
// Options Factory
// ===========================

/** Create typed options for generateMotion() without executing. */
export function createMotionOptions<
  TAdapter extends MotionAdapter<string, MotionProviderOptions<TAdapter>>,
  TStream extends boolean = false,
>(
  options: MotionActivityOptions<TAdapter, TStream>,
): MotionActivityOptions<TAdapter, TStream> {
  return options
}

export type { MotionAdapter, AnyMotionAdapter } from './adapter'
export { BaseMotionAdapter } from './adapter'
