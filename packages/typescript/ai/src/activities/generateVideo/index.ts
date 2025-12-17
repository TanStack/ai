/**
 * Video Activity (Experimental)
 *
 * Generates videos from text prompts using a jobs/polling architecture.
 * This is a self-contained module with implementation, types, and JSDoc.
 *
 * @experimental Video generation is an experimental feature and may change.
 */

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

/** Extract model types from a VideoAdapter */
export type VideoModels<TAdapter> =
  TAdapter extends VideoAdapter<infer M, any, any> ? M[number] : string

/**
 * Extract provider options from a VideoAdapter.
 */
export type VideoProviderOptions<TAdapter> =
  TAdapter extends VideoAdapter<any, infer TProviderOptions, any>
    ? TProviderOptions
    : object

// ===========================
// Activity Options Types
// ===========================

/**
 * Base options shared by all video activity operations.
 * The model is extracted from the adapter's selectedModel property.
 */
interface VideoActivityBaseOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
> {
  /** The video adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
}

/**
 * Options for creating a new video generation job.
 * The model is extracted from the adapter's selectedModel property.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoCreateOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
> extends VideoActivityBaseOptions<TAdapter> {
  /** Request type - create a new job (default if not specified) */
  request?: 'create'
  /** Text description of the desired video */
  prompt: string
  /** Video size in WIDTHxHEIGHT format (e.g., "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Provider-specific options for video generation */
  modelOptions?: VideoProviderOptions<TAdapter>
}

/**
 * Options for polling the status of a video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoStatusOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
>(options: VideoCreateOptions<TAdapter>): Promise<VideoJobResult> {
  const { adapter, prompt, size, duration, modelOptions } = options
  const model = adapter.selectedModel

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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
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

  // Get status first
  const statusResult = await adapter.getVideoStatus(jobId)

  // If completed, also get the URL
  if (statusResult.status === 'completed') {
    try {
      const urlResult = await adapter.getVideoUrl(jobId)
      return {
        status: statusResult.status,
        progress: statusResult.progress,
        url: urlResult.url,
      }
    } catch (error) {
      // If URL fetch fails, still return status
      return {
        status: statusResult.status,
        progress: statusResult.progress,
        error:
          error instanceof Error ? error.message : 'Failed to get video URL',
      }
    }
  }

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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object, string>,
>(options: VideoCreateOptions<TAdapter>): VideoCreateOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type { VideoAdapter, VideoAdapterConfig } from './adapter'
export { BaseVideoAdapter } from './adapter'
