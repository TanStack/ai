/**
 * Video Activity (Experimental)
 *
 * Generates videos from text prompts using a jobs/polling architecture.
 * This is a self-contained module with implementation, types, and JSDoc.
 *
 * @experimental Video generation is an experimental feature and may change.
 */

import { aiEventClient } from '../../event-client.js'
import type { VideoAdapter } from './adapter'
import type {
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
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoCreateOptions<
  TAdapter extends VideoAdapter<string, any, any, any>,
> = VideoActivityBaseOptions<TAdapter> & {
  /** Request type - create a new job (default if not specified) */
  request?: 'create'
  /** Text description of the desired video */
  prompt: string
  /** Video size — format depends on the provider (e.g., "16:9", "1280x720") */
  size?: VideoSizeForAdapter<TAdapter>
  /** Video duration in seconds */
  duration?: number
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
> = TRequest extends 'status'
  ? VideoStatusOptions<TAdapter>
  : TRequest extends 'url'
    ? VideoUrlOptions<TAdapter>
    : VideoCreateOptions<TAdapter>

// ===========================
// Activity Result Types
// ===========================

/**
 * Result type for the video activity, based on request type.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoActivityResult<
  TRequest extends 'create' | 'status' | 'url' = 'create',
> = TRequest extends 'status'
  ? Promise<VideoStatusResult>
  : TRequest extends 'url'
    ? Promise<VideoUrlResult>
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
 */
export async function generateVideo<
  TAdapter extends VideoAdapter<string, any, any, any>,
>(options: VideoCreateOptions<TAdapter>): Promise<VideoJobResult> {
  const { adapter, prompt, size, duration, modelOptions } = options
  const model = adapter.model

  return adapter.createVideoJob({
    model,
    prompt,
    size,
    duration,
    modelOptions,
  })
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
      aiEventClient.emit('video:request:completed', {
        requestId,
        provider: adapter.name,
        model: adapter.model,
        requestType: 'status',
        jobId,
        status: statusResult.status,
        progress: statusResult.progress,
        error:
          error instanceof Error ? error.message : 'Failed to get video URL',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      })
      // If URL fetch fails, still return status
      return {
        status: statusResult.status,
        progress: statusResult.progress,
        error:
          error instanceof Error ? error.message : 'Failed to get video URL',
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
>(options: VideoCreateOptions<TAdapter>): VideoCreateOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type {
  VideoAdapter,
  VideoAdapterConfig,
  AnyVideoAdapter,
} from './adapter'
export { BaseVideoAdapter } from './adapter'
