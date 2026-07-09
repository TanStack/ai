/**
 * Video Activity (Experimental)
 *
 * Generates videos from text prompts using a jobs/polling architecture.
 * This is a self-contained module with implementation, types, and JSDoc.
 *
 * @experimental Video generation is an experimental feature and may change.
 */

import { aiEventClient } from '@tanstack/ai-event-client'
import { toRunErrorPayload } from '../error-payload'
import {
  generationIdentityFields,
  rejectEventsOnlyReplay,
  replayGenerationEvents,
} from '../generation-run'
import { resolveDebugOption } from '../../logger/resolve'
import {
  applyGenerationResultTransforms,
  createGenerationContext,
  runGenerationAbort,
  runGenerationError,
  runGenerationFinish,
  runGenerationStart,
  runGenerationUsage,
} from '../middleware'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type {
  GenerationMiddleware,
  GenerationRunIdentity,
  GenerationRunOptions,
} from '../middleware'
import type { VideoAdapter } from './adapter'
import type {
  MediaPrompt,
  MediaPromptFor,
  StreamChunk,
  TokenUsage,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'video' as const

// ===========================
// Type Extraction Helpers
// ===========================

/**
 * Extract provider options from a VideoAdapter via ~types.
 */
export type VideoProviderOptions<TAdapter> =
  TAdapter extends VideoAdapter<any, any, any, any>
    ? TAdapter['~types']['providerOptions']
    : object

/**
 * Extract the size type for a VideoAdapter's model via ~types.
 */
export type VideoSizeForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<infer TModel, any, any, infer TSizeMap>
    ? TModel extends keyof TSizeMap
      ? TSizeMap[TModel]
      : string
    : string

/**
 * Extract the prompt type a model accepts from a VideoAdapter via ~types.
 * Mirrors `ImagePromptForModel`: models in the adapter's input-modality map
 * get a `prompt` narrowed to text + their supported part types; adapters
 * without a map fall back to the full MediaPrompt.
 */
export type VideoPromptForAdapter<TAdapter> =
  TAdapter extends VideoAdapter<infer TModel, any, any, any, infer ModsByName>
    ? string extends keyof ModsByName
      ? MediaPrompt
      : TModel extends keyof ModsByName
        ? MediaPromptFor<ModsByName[TModel][number]>
        : MediaPrompt
    : MediaPrompt

/**
 * Extract the duration type for a VideoAdapter's model via ~types.
 * Mirrors `VideoSizeForAdapter`. Falls back to `number` for adapters that
 * haven't declared per-model duration constraints.
 */
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

/**
 * Base options shared by all video activity operations.
 * The model is extracted from the adapter's model property.
 */
interface VideoActivityBaseOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
> {
  /** The video adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
}

/**
 * Options for creating a new video generation job.
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The video adapter type
 * @template TStream - Whether to stream the output
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoCreateOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
  TStream extends boolean = false,
> = VideoActivityBaseOptions<TAdapter> &
  GenerationRunOptions<VideoJobResult | VideoUrlResult> & {
    /** Request type - create a new job (default if not specified) */
    request?: 'create'
    /**
     * Description of the desired video. Either a plain string, or — for models
     * that support image-conditioned generation — an ordered array of content
     * parts interleaving text with image inputs. Image parts may carry
     * `metadata.role` (`'start_frame' | 'end_frame' | 'reference' |
     * 'character'`) to disambiguate intent; positional fallback otherwise. The
     * accepted part types are narrowed per model via the adapter's
     * input-modality map.
     */
    prompt: VideoPromptForAdapter<TAdapter>
    /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
    size?: VideoSizeForAdapter<TAdapter>
    /**
     * Video duration in seconds. Adapters that declare a per-model duration
     * map narrow this to the model's valid union (e.g. `4 | 6 | 8` for Veo 3).
     * Pass `adapter.snapDuration(seconds)` to coerce raw seconds to a valid
     * value.
     */
    duration?: VideoDurationForAdapter<TAdapter>
    /**
     * Whether to stream the video generation lifecycle.
     * When true, returns an AsyncIterable<StreamChunk> that handles the full
     * job lifecycle: create job, poll for status, yield updates, and yield final result.
     * When false or not provided, returns a Promise<VideoJobResult>.
     *
     * @default false
     */
    stream?: TStream
    /** Polling interval in milliseconds (stream mode only). @default 2000 */
    pollingInterval?: number
    /** Maximum time to wait before timing out in milliseconds (stream mode only). @default 600000 */
    maxDuration?: number
    /**
     * Enable debug logging. Pass `true` to enable all categories, `false` to
     * silence everything including errors, or a `DebugConfig` object for granular
     * control and/or a custom `Logger`.
     */
    debug?: DebugOption
    /**
     * Observe-only middleware notified on start, usage, success, and error. Pass
     * `otelMiddleware()` to emit OpenTelemetry spans, or implement the
     * `GenerationMiddleware` contract for a custom backend. In streaming mode the
     * span covers the full create→poll→complete lifecycle; in non-streaming mode
     * it covers job submission. An abandoned stream fires `onAbort`.
     */
    middleware?: Array<GenerationMiddleware>
  } & ({} extends VideoProviderOptions<TAdapter>
    ? {
        /** Provider-specific options for video generation */ modelOptions?: VideoProviderOptions<TAdapter>
      }
    : {
        /** Provider-specific options for video generation */ modelOptions: VideoProviderOptions<TAdapter>
      })

/**
 * Options for polling the status of a video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoStatusOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - get job status */
  request: 'status'
  /** The job ID to check status for */
  jobId: string
}

/**
 * Options for getting the URL of a completed video.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoUrlOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - get video URL */
  request: 'url'
  /** The job ID to get URL for */
  jobId: string
}

/**
 * Union type for all video activity options.
 * Discriminated by the `request` field.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoActivityOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
  TRequest extends 'create' | 'status' | 'url' = 'create',
  TStream extends boolean = false,
> = TRequest extends 'status'
  ? VideoStatusOptions<TAdapter>
  : TRequest extends 'url'
    ? VideoUrlOptions<TAdapter>
    : VideoCreateOptions<TAdapter, TStream>

// ===========================
// Activity Result Types
// ===========================

/**
 * Result type for the video activity, based on request type and streaming.
 * - If stream is true (create request): AsyncIterable<StreamChunk>
 * - Otherwise: Promise<VideoJobResult | VideoStatusResult | VideoUrlResult>
 *
 * @experimental Video generation is an experimental feature and may change.
 */
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

// ===========================
// Activity Implementation
// ===========================

/**
 * Generate video - creates a video generation job from a text prompt.
 *
 * Uses AI video generation models to create videos based on natural language descriptions.
 * Unlike image generation, video generation is asynchronous and requires polling for completion.
 *
 * When `stream: true` is passed, handles the full job lifecycle automatically:
 * create job → poll for status → stream updates → yield final result.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example Create a video generation job
 * ```ts
 * import { generateVideo } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * // Start a video generation job
 * const { jobId } = await generateVideo({
 *   adapter: openaiVideo('sora-2'),
 *   prompt: 'A cat chasing a dog in a sunny park'
 * })
 *
 * console.log('Job started:', jobId)
 * ```
 *
 * @example Stream the full video generation lifecycle
 * ```ts
 * import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * const stream = generateVideo({
 *   adapter: openaiVideo('sora-2'),
 *   prompt: 'A cat chasing a dog in a sunny park',
 *   stream: true,
 *   pollingInterval: 3000,
 * })
 *
 * return toServerSentEventsResponse(stream)
 * ```
 */
export function generateVideo<
  TAdapter extends VideoAdapter<string, any, any, any>,
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

/**
 * Internal implementation of non-streaming video job creation.
 */
async function runCreateVideoJob<
  TAdapter extends VideoAdapter<string, any, any, any>,
>(options: VideoCreateOptions<TAdapter, boolean>): Promise<VideoJobResult> {
  rejectEventsOnlyReplay(options.replay)

  if (options.replay && 'result' in options.replay) {
    return options.replay.result as VideoJobResult
  }

  const {
    adapter,
    prompt,
    size,
    duration,
    modelOptions,
    middleware,
    threadId,
    runId,
  } = options
  const model = adapter.model
  const requestId = createId('video')
  const startTime = Date.now()
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'video',
    provider: adapter.name,
    model,
    modelOptions,
    threadId,
    runId,
    artifactInputs: { prompt, size, duration },
    createId,
  })

  await runGenerationStart(middleware, mwCtx)

  logger.request(`activity=generateVideo provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const rawResult = await adapter.createVideoJob({
      model,
      prompt,
      size,
      duration,
      modelOptions,
      logger,
    })
    const result = await applyGenerationResultTransforms(mwCtx, rawResult)
    logger.output(`activity=generateVideo jobId=${result.jobId}`, {
      jobId: result.jobId,
      model: result.model,
    })
    // Non-streaming create only submits the job; usage isn't known until the
    // job completes via polling, so the span covers submission only.
    await runGenerationFinish(middleware, mwCtx, {
      duration: Date.now() - startTime,
    })
    return result
  } catch (error) {
    await runGenerationError(middleware, mwCtx, {
      error,
      duration: Date.now() - startTime,
    })
    logger.errors('generateVideo activity failed', {
      error,
      source: 'generateVideo',
    })
    throw error
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Internal streaming implementation for video generation.
 * Handles the full job lifecycle: create job → poll for status → stream updates → yield final result.
 */
async function* runStreamingVideoGeneration<
  TAdapter extends VideoAdapter<string, any, any, any>,
>(options: VideoCreateOptions<TAdapter, true>): AsyncIterable<StreamChunk> {
  if (options.replay?.events) {
    yield* replayGenerationEvents(options.replay)
    return
  }

  const { adapter, prompt, size, duration, modelOptions, middleware } = options
  const model = adapter.model
  const runId = options.runId ?? createId('run')
  const requestId = createId('video')
  const obsStartTime = Date.now()
  const pollingInterval = options.pollingInterval ?? 2000
  const maxDuration = options.maxDuration ?? 600_000
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const threadId = options.threadId ?? createId('thread')
  const identity = { threadId, runId }

  yield {
    type: 'RUN_STARTED',
    runId,
    threadId,
    ...generationIdentityFields(identity),
    timestamp: Date.now(),
  } as StreamChunk

  if (options.replay && 'result' in options.replay) {
    const replayResult = options.replay.result as {
      artifacts?: Array<unknown>
    }
    if (replayResult.artifacts && replayResult.artifacts.length > 0) {
      yield {
        type: 'CUSTOM',
        name: 'generation:artifacts',
        value: replayResult.artifacts,
        ...generationIdentityFields(identity),
        timestamp: Date.now(),
      } as StreamChunk
    }

    yield {
      type: 'CUSTOM',
      name: 'generation:result',
      value: options.replay.result,
      ...generationIdentityFields(identity),
      timestamp: Date.now(),
    } as StreamChunk

    yield {
      type: 'RUN_FINISHED',
      runId,
      threadId,
      finishReason: 'stop',
      ...generationIdentityFields(identity),
      timestamp: Date.now(),
    } as StreamChunk
    return
  }

  const mwCtx = createGenerationContext({
    requestId,
    activity: 'video',
    provider: adapter.name,
    model,
    modelOptions,
    threadId,
    runId,
    artifactInputs: { prompt, size, duration },
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

  // Tracks whether a terminal observer event (finish/error) has already fired,
  // so the `finally` below can fire one on abandonment without double-firing.
  let settled = false
  try {
    // Create the video generation job
    const jobResult = await adapter.createVideoJob({
      model,
      prompt,
      size,
      duration,
      modelOptions,
      logger,
    })

    yield {
      type: 'CUSTOM',
      name: 'video:job:created',
      value: { jobId: jobResult.jobId },
      ...generationIdentityFields(identity),
      timestamp: Date.now(),
    } as StreamChunk

    // Poll for completion
    const startTime = Date.now()
    while (Date.now() - startTime < maxDuration) {
      await sleep(pollingInterval)

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
        ...generationIdentityFields(identity),
        timestamp: Date.now(),
      } as StreamChunk

      if (statusResult.status === 'completed') {
        const rawUrlResult = await adapter.getVideoUrl(jobResult.jobId)
        const urlResult = await applyGenerationResultTransforms(
          mwCtx,
          rawUrlResult,
        )

        logger.output(
          `activity=generateVideo jobId=${jobResult.jobId} status=completed`,
          {
            jobId: jobResult.jobId,
            url: urlResult.url,
          },
        )

        // Fire finish before yielding the terminal chunks: the generation has
        // succeeded, so a consumer that stops reading after `generation:result`
        // (without pulling `RUN_FINISHED`) must not trip the abandonment path in
        // `finally`, which would otherwise report a spurious cancellation.
        if (urlResult.usage)
          await runGenerationUsage(middleware, mwCtx, urlResult.usage)
        await runGenerationFinish(middleware, mwCtx, {
          duration: Date.now() - obsStartTime,
          usage: urlResult.usage,
        })
        settled = true

        if (urlResult.artifacts && urlResult.artifacts.length > 0) {
          yield {
            type: 'CUSTOM',
            name: 'generation:artifacts',
            value: urlResult.artifacts,
            ...generationIdentityFields(identity),
            timestamp: Date.now(),
          } as StreamChunk
        }

        yield {
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            ...urlResult,
            status: 'completed',
          },
          ...generationIdentityFields(identity),
          timestamp: Date.now(),
        } as StreamChunk

        yield {
          type: 'RUN_FINISHED',
          runId,
          threadId,
          finishReason: 'stop',
          ...generationIdentityFields(identity),
          timestamp: Date.now(),
        } as StreamChunk
        return
      }

      if (statusResult.status === 'failed') {
        throw new Error(statusResult.error || 'Video generation failed')
      }
    }

    throw new Error('Video generation timed out')
  } catch (error: unknown) {
    const payload = toRunErrorPayload(error, 'Video generation failed')
    // Mark settled before firing onError: if a user error-hook throws, the
    // `finally` below must still not double-fire onAbort over the same op
    // (which would mask the original error and end the span twice).
    settled = true
    await runGenerationError(middleware, mwCtx, {
      error,
      duration: Date.now() - obsStartTime,
    })
    logger.errors('generateVideo activity failed', {
      message: payload.message,
      code: payload.code,
      source: 'generateVideo',
    })
    yield {
      type: 'RUN_ERROR',
      runId,
      threadId,
      ...generationIdentityFields(identity),
      message: payload.message,
      code: payload.code,
      error: payload,
      timestamp: Date.now(),
    } as StreamChunk
  } finally {
    if (!settled) {
      // The consumer abandoned the stream (broke the `for await` loop or
      // disconnected) before completion, so the generator is being unwound at
      // a `yield` without reaching finish/error. Fire `onAbort` — a cancel, not
      // an error — so otelMiddleware ends its span instead of leaking it.
      await runGenerationAbort(middleware, mwCtx, {
        reason: 'Video generation stream abandoned before completion',
        duration: Date.now() - obsStartTime,
      })
    }
  }
}

/**
 * Get video job status - returns the current status, progress, and URL if available.
 *
 * This function combines status checking and URL retrieval. If the job is completed,
 * it will automatically fetch and include the video URL.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example Check job status
 * ```ts
 * import { getVideoJobStatus } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * const result = await getVideoJobStatus({
 *   adapter: openaiVideo('sora-2'),
 *   jobId: 'job-123'
 * })
 *
 * console.log('Status:', result.status)
 * console.log('Progress:', result.progress)
 * if (result.url) {
 *   console.log('Video URL:', result.url)
 * }
 * ```
 */
export async function getVideoJobStatus<
  TAdapter extends VideoAdapter<string, any, any, any>,
>(
  options: {
    adapter: TAdapter & { kind: typeof kind }
    jobId: string
  } & GenerationRunIdentity,
): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  error?: string
  usage?: TokenUsage
}> {
  const { adapter, jobId, threadId, runId } = options
  const requestId = createId('video-status')
  const startTime = Date.now()
  const identity = { threadId, runId }

  aiEventClient.emit('video:request:started', {
    requestId,
    ...generationIdentityFields(identity),
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
    try {
      const urlResult = await adapter.getVideoUrl(jobId)
      aiEventClient.emit('video:request:completed', {
        requestId,
        ...generationIdentityFields(identity),
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
          ...generationIdentityFields(identity),
          model: adapter.model,
          usage: urlResult.usage,
          timestamp: Date.now(),
        })
      }
      return {
        status: statusResult.status,
        progress: statusResult.progress,
        url: urlResult.url,
        ...(urlResult.usage ? { usage: urlResult.usage } : {}),
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to get video URL'
      aiEventClient.emit('video:request:completed', {
        requestId,
        ...generationIdentityFields(identity),
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
      // Provider reported completed but result fetch failed — treat as failed
      return {
        status: 'failed' as const,
        progress: statusResult.progress,
        error: errorMessage,
      }
    }
  }

  aiEventClient.emit('video:request:completed', {
    requestId,
    ...generationIdentityFields(identity),
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

  // Return status for non-completed jobs
  return {
    status: statusResult.status,
    progress: statusResult.progress,
    error: statusResult.error,
  }
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateVideo() function without executing.
 */
export function createVideoOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
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
