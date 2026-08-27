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
  toAbortError,
} from '../../utilities/activity-abort'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type {
  GenerationMiddleware,
  GenerationMiddlewareContext,
} from '../middleware/types'
import type { VideoAdapter } from './adapter'
import { normalizeStreamChunk } from '../../utilities/normalize-stream-chunk'
import type { AdapterYieldChunk } from '../../utilities/adapter-yield-chunk'
import type {
  MediaPrompt,
  MediaPromptFor,
  PersistedArtifactRef,
  StreamChunk,
  TokenUsage,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../../types'

/** The adapter kind this activity handles */
export const kind = 'video' as const

export type VideoProviderOptions<TAdapter> =
  TAdapter extends VideoAdapter<any, any, any, any, any, any>
    ? TAdapter['~types']['providerOptions']
    : object

export type VideoSizeForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<
    infer TModel,
    any,
    any,
    infer TSizeMap,
    any,
    any
  >
    ? TModel extends keyof TSizeMap
      ? TSizeMap[TModel]
      : string
    : string

export type VideoPromptForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<
    infer TModel,
    any,
    any,
    any,
    infer ModsByName,
    any
  >
    ? string extends keyof ModsByName
      ? MediaPrompt
      : TModel extends keyof ModsByName
        ? MediaPromptFor<ModsByName[TModel][number]>
        : MediaPrompt
    : MediaPrompt

export type VideoDurationForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<
    infer TModel,
    any,
    any,
    any,
    any,
    infer TDurationMap
  >
    ? TModel extends keyof TDurationMap
      ? TDurationMap[TModel]
      : number
    : number

// ===========================
// Activity Options Types

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
// ===========================

interface VideoActivityBaseOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> {
  /** The video adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
}

export type VideoCreateOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TStream extends boolean = false,
> = VideoActivityBaseOptions<TAdapter> & {
  /** Request type - create a new job (default if not specified) */
  request?: 'create'
  prompt: VideoPromptForAdapter<TAdapter>
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: VideoSizeForAdapter<TAdapter>
  duration?: VideoDurationForAdapter<TAdapter>
  stream?: TStream
  /** Polling interval in milliseconds (stream mode only). @default 2000 */
  pollingInterval?: number
  /** Maximum time to wait before timing out in milliseconds (stream mode only). @default 600000 */
  maxDuration?: number
  runId?: string
  threadId?: string
  debug?: DebugOption
  middleware?: Array<GenerationMiddleware>
  timeout?: number
  abortSignal?: AbortSignal
} & ({} extends VideoProviderOptions<TAdapter>
    ? {
        /** Provider-specific options for video generation */ modelOptions?: VideoProviderOptions<TAdapter>
      }
    : {
        /** Provider-specific options for video generation */ modelOptions: VideoProviderOptions<TAdapter>
      })

export interface VideoStatusOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - get job status */
  request: 'status'
  /** The job ID to check status for */
  jobId: string
}

export interface VideoUrlOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - get video URL */
  request: 'url'
  /** The job ID to get URL for */
  jobId: string
}

export type VideoActivityOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TRequest extends 'create' | 'status' | 'url' = 'create',
  TStream extends boolean = false,
> = TRequest extends 'status'
  ? VideoStatusOptions<TAdapter>
  : TRequest extends 'url'
    ? VideoUrlOptions<TAdapter>
    : VideoCreateOptions<TAdapter, TStream>

export type VideoActivityResult<
  TRequest extends 'create' | 'status' | 'url' = 'create',
  TStream extends boolean = false,
> = TRequest extends 'status'
  ? Promise<VideoStatusResult>
  : TRequest extends 'url'
    ? Promise<VideoUrlResult>
    : TStream extends true
      ? AsyncIterable<StreamChunk>
      : Promise<VideoJobResult>

export function generateVideo<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TStream extends boolean = false,
>(
  options: VideoCreateOptions<TAdapter, TStream>,
): VideoActivityResult<'create', TStream> {
  if (options.stream) {
    return runStreamingVideoGeneration(
      options as VideoCreateOptions<TAdapter, true>,
    ) as VideoActivityResult<'create', TStream>
  }

  return runCreateVideoJob(options) as VideoActivityResult<'create', TStream>
}

function videoRunIdForJob(provider: string, jobId: string): string {
  return `video:${encodeURIComponent(provider)}:${encodeURIComponent(jobId)}`
}

async function runCreateVideoJob<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
>(options: VideoCreateOptions<TAdapter, boolean>): Promise<VideoJobResult> {
  const {
    adapter,
    prompt,
    size,
    duration,
    modelOptions,
    middleware,
    timeout,
    abortSignal: callerAbortSignal,
  } = options
  const model = adapter.model
  const requestId = createId('video')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const contextFor = (runId?: string): GenerationMiddlewareContext =>
    createGenerationContext({
      requestId,
      activity: 'video',
      provider: adapter.name,
      model,
      modelOptions,
      threadId: options.threadId,
      runId,
      artifactInputs: { prompt },
      createId,
    })

  logger.request(`activity=generateVideo provider=${providerName}`, {
    provider: providerName,
    model,
  })

  let jobResult: VideoJobResult
  try {
    jobResult = await raceWithAbort(
      adapter.createVideoJob({
        model,
        prompt,
        size,
        duration,
        modelOptions,
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
    logger.errors('generateVideo activity failed', {
      error,
      source: 'generateVideo',
    })
    throw error
  }

  logger.output(`activity=generateVideo jobId=${jobResult.jobId}`, {
    jobId: jobResult.jobId,
    model: jobResult.model,
  })

  const mwCtx = contextFor(videoRunIdForJob(adapter.name, jobResult.jobId))
  await runGenerationStart(middleware, mwCtx)
  return await applyGenerationResultTransforms(mwCtx, jobResult)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
  if (signal.aborted) {
    return Promise.reject(toAbortError(signal.reason))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(toAbortError(signal.reason))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function* runStreamingVideoGeneration<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
>(options: VideoCreateOptions<TAdapter, true>): AsyncIterable<StreamChunk> {
  const {
    adapter,
    prompt,
    size,
    duration,
    modelOptions,
    middleware,
    timeout,
    abortSignal: callerAbortSignal,
  } = options
  const model = adapter.model
  const runId = options.runId ?? createId('run')
  const requestId = createId('video')
  const obsStartTime = Date.now()
  const pollingInterval = options.pollingInterval ?? 2000
  const maxDuration = options.maxDuration ?? 600_000
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const abortControls = createActivityAbortControls({
    timeout,
    abortSignal: callerAbortSignal,
  })
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const wireThreadId = options.threadId ?? createId('thread')

  yield {
    type: 'RUN_STARTED',
    runId,
    threadId: wireThreadId,
    timestamp: Date.now(),
  } as StreamChunk

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'video',
    provider: adapter.name,
    model,
    modelOptions,
    threadId: options.threadId,
    runId,
    artifactInputs: { prompt },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  logger.request(
    `activity=generateVideo provider=${providerName} stream=true`,
    {
      provider: providerName,
      model,
    },
  )

  let settled = false
  try {
    // Create the video generation job
    const jobResult = await raceWithAbort(
      adapter.createVideoJob({
        model,
        prompt,
        size,
        duration,
        modelOptions,
        logger,
        ...(abortControls.signal ? { abortSignal: abortControls.signal } : {}),
      }),
      abortControls.signal,
    )

    yield {
      type: 'CUSTOM',
      name: 'video:job:created',
      value: { jobId: jobResult.jobId },
      timestamp: Date.now(),
    }

    // Poll for completion
    const startTime = Date.now()
    while (Date.now() - startTime < maxDuration) {
      await sleep(pollingInterval, abortControls.signal)

      const statusResult = await adapter.getVideoStatus(jobResult.jobId)

      yield {
        type: 'CUSTOM',
        name: 'video:status',
        value: {
          jobId: jobResult.jobId,
          status: statusResult.status,
          progress: statusResult.progress,
          error: statusResult.error,
        },
        timestamp: Date.now(),
      }

      if (statusResult.status === 'completed') {
        const urlResult = await adapter.getVideoUrl(jobResult.jobId)

        logger.output(
          `activity=generateVideo jobId=${jobResult.jobId} status=completed`,
          {
            jobId: jobResult.jobId,
            url: urlResult.url,
          },
        )

        const rawResult = {
          jobId: jobResult.jobId,
          status: 'completed' as const,
          url: urlResult.url,
          expiresAt: urlResult.expiresAt,
          ...(urlResult.usage ? { usage: urlResult.usage } : {}),
        }
        const result = await applyGenerationResultTransforms(mwCtx, rawResult)

        if (urlResult.usage)
          await runGenerationUsage(middleware, mwCtx, urlResult.usage)
        await runGenerationFinish(middleware, mwCtx, {
          duration: Date.now() - obsStartTime,
          usage: urlResult.usage,
        })
        settled = true
        abortControls.clear()

        yield {
          type: 'CUSTOM',
          name: 'generation:result',
          value: result,
          timestamp: Date.now(),
        }

        yield* normalizeStreamChunk({
          type: 'RUN_FINISHED',
          runId,
          threadId: wireThreadId,
          finishReason: 'stop',
          timestamp: Date.now(),
        } as AdapterYieldChunk)
        return
      }

      if (statusResult.status === 'failed') {
        throw new Error(statusResult.error || 'Video generation failed')
      }
    }

    throw new Error('Video generation timed out')
  } catch (error: unknown) {
    abortControls.clear()
    const payload = toRunErrorPayload(error, 'Video generation failed')
    settled = true
    const elapsed = Date.now() - obsStartTime
    if (isActivityAbortError(error, abortControls.signal)) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: abortReasonMessage(error, abortControls.signal),
        duration: elapsed,
      })
    } else {
      await runGenerationError(middleware, mwCtx, {
        error,
        duration: elapsed,
      })
    }
    logger.errors('generateVideo activity failed', {
      message: payload.message,
      code: payload.code,
      source: 'generateVideo',
    })
    yield* normalizeStreamChunk({
      type: 'RUN_ERROR',
      runId,
      threadId: wireThreadId,
      message: payload.message,
      ...(payload.code !== undefined ? { code: payload.code } : {}),
      timestamp: Date.now(),
    } as AdapterYieldChunk)
  } finally {
    abortControls.clear()
    if (!settled) {
      await runGenerationAbort(middleware, mwCtx, {
        reason: 'Video generation stream abandoned before completion',
        duration: Date.now() - obsStartTime,
      })
    }
  }
}

export interface VideoJobStatusOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
> {
  /** The video adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** The job ID to check status for */
  jobId: string
  threadId?: string
  middleware?: Array<GenerationMiddleware>
}

export interface VideoJobStatusResult {
  /** Job identifier */
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  /** When the provider url expires, if it reported one. */
  expiresAt?: Date
  error?: string
  usage?: TokenUsage
  /** Durable artifact references, when generation persistence is wired. */
  artifacts?: Array<PersistedArtifactRef>
}

export async function getVideoJobStatus<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
>(options: VideoJobStatusOptions<TAdapter>): Promise<VideoJobStatusResult> {
  const { adapter, jobId, middleware } = options
  const requestId = createId('video-status')
  const startTime = Date.now()

  const terminalContext = (): GenerationMiddlewareContext =>
    createGenerationContext({
      requestId,
      activity: 'video',
      provider: adapter.name,
      model: adapter.model,
      threadId: options.threadId,
      runId: videoRunIdForJob(adapter.name, jobId),
      createId,
    })

  aiEventClient.emit('video:request:started', {
    requestId,
    provider: adapter.name,
    model: adapter.model,
    requestType: 'status',
    jobId,
    timestamp: startTime,
  })

  // Get status first
  const statusResult = await adapter.getVideoStatus(jobId)

  // If completed, also get the URL
  if (statusResult.status === 'completed') {
    let urlResult: VideoUrlResult
    try {
      urlResult = await adapter.getVideoUrl(jobId)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get video URL'
      aiEventClient.emit('video:request:completed', {
        requestId,
        provider: adapter.name,
        model: adapter.model,
        requestType: 'status',
        jobId,
        status: 'failed',
        progress: statusResult.progress,
        error: errorMessage,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })
      // Provider reported completed but result fetch failed — treat as failed,
      // and fail the run with it: the job is terminal, so nothing later will.
      await runGenerationError(middleware, terminalContext(), {
        error,
        duration: Date.now() - startTime,
      })
      return {
        jobId,
        status: 'failed' as const,
        progress: statusResult.progress,
        error: errorMessage,
      }
    }

    aiEventClient.emit('video:request:completed', {
      requestId,
      provider: adapter.name,
      model: adapter.model,
      requestType: 'status',
      jobId,
      status: statusResult.status,
      progress: statusResult.progress,
      url: urlResult.url,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
    })
    if (urlResult.usage) {
      aiEventClient.emit('video:usage', {
        requestId,
        model: adapter.model,
        usage: urlResult.usage,
        timestamp: Date.now(),
      })
    }

    const mwCtx = terminalContext()
    await runGenerationStart(middleware, mwCtx)
    const result = await applyGenerationResultTransforms<VideoJobStatusResult>(
      mwCtx,
      {
        jobId,
        status: 'completed',
        ...(statusResult.progress !== undefined
          ? { progress: statusResult.progress }
          : {}),
        url: urlResult.url,
        ...(urlResult.expiresAt ? { expiresAt: urlResult.expiresAt } : {}),
        ...(urlResult.usage ? { usage: urlResult.usage } : {}),
      },
    )
    if (urlResult.usage)
      await runGenerationUsage(middleware, mwCtx, urlResult.usage)
    await runGenerationFinish(middleware, mwCtx, {
      duration: Date.now() - startTime,
      usage: urlResult.usage,
    })
    return result
  }

  aiEventClient.emit('video:request:completed', {
    requestId,
    provider: adapter.name,
    model: adapter.model,
    requestType: 'status',
    jobId,
    status: statusResult.status,
    progress: statusResult.progress,
    error: statusResult.error,
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  })

  // A failed job is terminal for the run too: without this the record would sit
  // at `running` forever, indistinguishable from a job still being worked on.
  if (statusResult.status === 'failed') {
    await runGenerationError(middleware, terminalContext(), {
      error: new Error(statusResult.error || 'Video generation failed'),
      duration: Date.now() - startTime,
    })
  }

  // Return status for non-completed jobs
  return {
    jobId,
    status: statusResult.status,
    progress: statusResult.progress,
    error: statusResult.error,
  }
}

export function createVideoOptions<
  TAdapter extends VideoAdapter<string, any, any, any, any, any>,
  TStream extends boolean = false,
>(
  options: VideoCreateOptions<TAdapter, TStream>,
): VideoCreateOptions<TAdapter, TStream> {
  return options
}

// Re-export adapter types
export type {
  VideoAdapter,
  VideoAdapterConfig,
  AnyVideoAdapter,
} from './adapter'
export { BaseVideoAdapter } from './adapter'
