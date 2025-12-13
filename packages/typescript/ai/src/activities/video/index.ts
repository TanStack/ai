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
  TAdapter extends VideoAdapter<infer M, any> ? M[number] : string

/**
 * Extract provider options from a VideoAdapter.
 */
export type VideoProviderOptions<TAdapter> =
  TAdapter extends VideoAdapter<any, infer TProviderOptions>
    ? TProviderOptions
    : object

// ===========================
// Activity Options Types
// ===========================

/**
 * Base options shared by all video activity operations.
 */
interface VideoActivityBaseOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> {
  /** The video adapter to use */
  adapter: TAdapter & { kind: typeof kind }
  /** The model name (autocompletes based on adapter) */
  model: TModel
}

/**
 * Options for creating a new video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoCreateOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> extends VideoActivityBaseOptions<TAdapter, TModel> {
  /** Request type - create a new job (default if not specified) */
  request?: 'create'
  /** Text description of the desired video */
  prompt: string
  /** Video size in WIDTHxHEIGHT format (e.g., "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Provider-specific options for video generation */
  providerOptions?: VideoProviderOptions<TAdapter>
}

/**
 * Options for polling the status of a video generation job.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoStatusOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> extends VideoActivityBaseOptions<TAdapter, TModel> {
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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> extends VideoActivityBaseOptions<TAdapter, TModel> {
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
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
  TRequest extends 'create' | 'status' | 'url' = 'create',
> = TRequest extends 'status'
  ? VideoStatusOptions<TAdapter, TModel>
  : TRequest extends 'url'
    ? VideoUrlOptions<TAdapter, TModel>
    : VideoCreateOptions<TAdapter, TModel>

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
 * Video activity - generates videos from text prompts using a jobs/polling pattern.
 *
 * Uses AI video generation models to create videos based on natural language descriptions.
 * Unlike image generation, video generation is asynchronous and requires polling for completion.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example Create a video generation job
 * ```ts
 * import { ai } from '@tanstack/ai'
 * import { openaiVideo } from '@tanstack/ai-openai'
 *
 * // Start a video generation job
 * const { jobId } = await ai({
 *   adapter: openaiVideo(),
 *   model: 'sora-2',
 *   prompt: 'A cat chasing a dog in a sunny park'
 * })
 *
 * console.log('Job started:', jobId)
 * ```
 *
 * @example Poll for job status
 * ```ts
 * // Check status of the job
 * const status = await ai({
 *   adapter: openaiVideo(),
 *   model: 'sora-2',
 *   jobId,
 *   request: 'status'
 * })
 *
 * console.log('Status:', status.status, 'Progress:', status.progress)
 * ```
 *
 * @example Get the video URL when complete
 * ```ts
 * // Get the video URL (after status is 'completed')
 * const { url } = await ai({
 *   adapter: openaiVideo(),
 *   model: 'sora-2',
 *   jobId,
 *   request: 'url'
 * })
 *
 * console.log('Video URL:', url)
 * ```
 */
export async function videoActivity<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
>(
  options:
    | VideoCreateOptions<TAdapter, TModel>
    | VideoStatusOptions<TAdapter, TModel>
    | VideoUrlOptions<TAdapter, TModel>,
): Promise<VideoJobResult | VideoStatusResult | VideoUrlResult> {
  const { adapter, request = 'create' } = options

  switch (request) {
    case 'status': {
      const statusOptions = options as VideoStatusOptions<TAdapter, TModel>
      return adapter.getVideoStatus(statusOptions.jobId)
    }
    case 'url': {
      const urlOptions = options as VideoUrlOptions<TAdapter, TModel>
      return adapter.getVideoUrl(urlOptions.jobId)
    }
    case 'create':
    default: {
      const createOptions = options as VideoCreateOptions<TAdapter, TModel>
      return adapter.createVideoJob({
        model: createOptions.model,
        prompt: createOptions.prompt,
        size: createOptions.size,
        duration: createOptions.duration,
        providerOptions: createOptions.providerOptions,
      })
    }
  }
}

// Re-export adapter types
export type { VideoAdapter, VideoAdapterConfig } from './adapter'
export { BaseVideoAdapter } from './adapter'
