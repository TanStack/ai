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
import { resolveDebugOption } from '../../logger/resolve'
import type { InternalLogger } from '../../logger/internal-logger'
import type { DebugOption } from '../../logger/types'
import type { VideoAdapter } from './adapter'
import type {
  StreamChunk,
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
> = VideoActivityBaseOptions<TAdapter> & {
  /** Request type - create a new job (default if not specified) */
  request?: 'create'
  /** Text description of the desired video */
  prompt: string
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: VideoSizeForAdapter<TAdapter>
  /** Video duration in seconds */
  duration?: number
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
  /** Custom run ID (stream mode only) */
  runId?: string
  /**
   * Enable debug logging. Pass `true` to enable all categories, `false` to
   * silence everything including errors, or a `DebugConfig` object for granular
   * control and/or a custom `Logger`.
   */
  debug?: DebugOption
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
  const { adapter, prompt, size, duration, modelOptions } = options
  const model = adapter.model
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  logger.request(`activity=generateVideo provider=${providerName}`, {
    provider: providerName,
    model,
  })

  try {
    const result = await adapter.createVideoJob({
      model,
      prompt,
      size,
      duration,
      modelOptions,
      logger,
    })
    logger.output(`activity=generateVideo jobId=${result.jobId}`, {
      jobId: result.jobId,
      model: result.model,
    })
    return result
  } catch (error) {
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
  const { adapter, prompt, size, duration, modelOptions } = options
  const model = adapter.model
  const runId = options.runId ?? createId('run')
  const pollingInterval = options.pollingInterval ?? 2000
  const maxDuration = options.maxDuration ?? 600_000
  const logger: InternalLogger = resolveDebugOption(options.debug)
  const providerName =
    (adapter as { name?: string; provider?: string }).provider ??
    (adapter as { name?: string }).name ??
    'unknown'

  const threadId = createId('thread')

  yield {
    type: 'RUN_STARTED',
    runId,
    threadId,
    timestamp: Date.now(),
  } as StreamChunk

  logger.request(
    `activity=generateVideo provider=${providerName} stream=true`,
    {
      provider: providerName,
      model,
    },
  )

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
        timestamp: Date.now(),
      } as StreamChunk

      if (statusResult.status === 'completed') {
        const urlResult = await adapter.getVideoUrl(jobResult.jobId)

        logger.output(
          `activity=generateVideo jobId=${jobResult.jobId} status=completed`,
          {
            jobId: jobResult.jobId,
            url: urlResult.url,
          },
        )

        yield {
          type: 'CUSTOM',
          name: 'generation:result',
          value: {
            jobId: jobResult.jobId,
            status: 'completed',
            url: urlResult.url,
            expiresAt: urlResult.expiresAt,
          },
          timestamp: Date.now(),
        } as StreamChunk

        yield {
          type: 'RUN_FINISHED',
          runId,
          threadId,
          finishReason: 'stop',
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
    logger.errors('generateVideo activity failed', {
      message: payload.message,
      code: payload.code,
      source: 'generateVideo',
    })
    yield {
      type: 'RUN_ERROR',
      runId,
      threadId,
      message: payload.message,
      code: payload.code,
      error: payload,
      timestamp: Date.now(),
    } as StreamChunk
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
>(options: {
  adapter: TAdapter & { kind: typeof kind }
  jobId: string
}): Promise<{
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  error?: string
}> {
  const { adapter, jobId } = options
  const requestId = createId('video-status')
  const startTime = Date.now()

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
    try {
      const urlResult = await adapter.getVideoUrl(jobId)
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
      return {
        status: statusResult.status,
        progress: statusResult.progress,
        url: urlResult.url,
      }
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
