import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { createOpenAIClient, getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  toApiSeconds,
  validateVideoSeconds,
  validateVideoSize,
} from '../video/video-provider-options'
import type { VideoModel } from 'openai/resources'
import type { OpenAIVideoModel } from '../model-meta'
import type {
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName,
  OpenAIVideoProviderOptions,
} from '../video/video-provider-options'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenAIVideoConfig extends OpenAIClientConfig {}

/**
 * OpenAI Video Generation Adapter
 *
 * Tree-shakeable adapter for OpenAI video generation functionality using Sora-2.
 * Uses a jobs/polling architecture for async video generation.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * Features:
 * - Async job-based video generation
 * - Status polling for job progress
 * - URL retrieval for completed videos
 * - Model-specific type-safe provider options
 */
export class OpenAIVideoAdapter<
  TModel extends OpenAIVideoModel,
> extends BaseVideoAdapter<
  TModel,
  OpenAIVideoProviderOptions,
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName
> {
  readonly name = 'openai' as const

  private client: OpenAI_SDK

  constructor(config: OpenAIVideoConfig, model: TModel) {
    super(config, model)
    this.client = createOpenAIClient(config)
  }

  /**
   * Create a new video generation job.
   *
   * API: POST /v1/videos
   * Docs: https://platform.openai.com/docs/api-reference/videos/create
   *
   * @experimental Video generation is an experimental feature and may change.
   *
   * @example
   * ```ts
   * const { jobId } = await adapter.createVideoJob({
   *   model: 'sora-2',
   *   prompt: 'A cat chasing a dog in a sunny park',
   *   size: '1280x720',
   *   duration: 8  // seconds: 4, 8, or 12
   * })
   * ```
   */
  async createVideoJob(
    options: VideoGenerationOptions<OpenAIVideoProviderOptions>,
  ): Promise<VideoJobResult> {
    const { model, size, duration, modelOptions } = options

    // Validate inputs
    validateVideoSize(model, size)
    // Duration maps to 'seconds' in the API
    const seconds = duration ?? modelOptions?.seconds
    validateVideoSeconds(model, seconds)

    // Build request
    const request = this.buildRequest(options)

    try {
      // POST /v1/videos
      // Cast to any because the videos API may not be in SDK types yet
      const client = this.client
      const response = await client.videos.create(request)

      return {
        jobId: response.id,
        model,
      }
    } catch (error: any) {
      // Fallback for when the videos API is not available
      if (error?.message?.includes('videos') || error?.code === 'invalid_api') {
        throw new Error(
          `Video generation API is not available. The Sora API may require special access. ` +
            `Original error: ${error.message}`,
        )
      }
      throw error
    }
  }

  /**
   * Get the current status of a video generation job.
   *
   * API: GET /v1/videos/{video_id}
   * Docs: https://platform.openai.com/docs/api-reference/videos/get
   *
   * @experimental Video generation is an experimental feature and may change.
   *
   * @example
   * ```ts
   * const status = await adapter.getVideoStatus(jobId)
   * if (status.status === 'completed') {
   *   console.log('Video is ready!')
   * } else if (status.status === 'processing') {
   *   console.log(`Progress: ${status.progress}%`)
   * }
   * ```
   */
  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    try {
      // GET /v1/videos/{video_id}
      const client = this.client
      const response = await client.videos.retrieve(jobId)

      return {
        jobId,
        status: this.mapStatus(response.status),
        progress: response.progress,
        error: response.error?.message,
      }
    } catch (error: any) {
      if (error.status === 404) {
        return {
          jobId,
          status: 'failed',
          error: 'Job not found',
        }
      }
      throw error
    }
  }

  /**
   * Get the URL to download/view the generated video.
   *
   * API: GET /v1/videos/{video_id}/content
   * Docs: https://platform.openai.com/docs/api-reference/videos/content
   *
   * @experimental Video generation is an experimental feature and may change.
   *
   * @example
   * ```ts
   * const { url, expiresAt } = await adapter.getVideoUrl(jobId)
   * console.log('Video URL:', url)
   * console.log('Expires at:', expiresAt)
   * ```
   */
  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    try {
      // GET /v1/videos/{video_id}/content
      // The SDK may not have a .content() method, so we try multiple approaches
      const client = this.client as any

      let response: any

      // Try different possible method names
      if (typeof client.videos?.content === 'function') {
        response = await client.videos.content(jobId)
      } else if (typeof client.videos?.getContent === 'function') {
        response = await client.videos.getContent(jobId)
      } else if (typeof client.videos?.download === 'function') {
        response = await client.videos.download(jobId)
      } else {
        // Fallback: check if retrieve returns the URL directly
        const videoInfo = await client.videos.retrieve(jobId)
        if (videoInfo.url) {
          return {
            jobId,
            url: videoInfo.url,
            expiresAt: videoInfo.expires_at
              ? new Date(videoInfo.expires_at)
              : undefined,
          }
        }

        // Last resort: The /content endpoint returns raw binary video data, not JSON.
        // We need to construct a URL that the client can use to fetch the video.
        // The URL needs to include auth, so we'll create a signed URL or return
        // a proxy endpoint.

        // For now, return a URL that goes through our API to proxy the request
        // since the raw endpoint requires auth headers that browsers can't send.
        // The video element can't add Authorization headers, so we need a workaround.

        // Option 1: Return the direct URL (only works if OpenAI supports query param auth)
        // Option 2: Return a blob URL after fetching (memory intensive)
        // Option 3: Return a proxy URL through our server

        // Let's try fetching and returning a data URL for now
        const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1'
        const apiKey = this.config.apiKey

        const contentResponse = await fetch(
          `${baseUrl}/videos/${jobId}/content`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          },
        )

        if (!contentResponse.ok) {
          // Try to parse error as JSON, but it might be binary
          const contentType = contentResponse.headers.get('content-type')
          if (contentType?.includes('application/json')) {
            const errorData = await contentResponse.json().catch(() => ({}))
            throw new Error(
              errorData.error?.message ||
                `Failed to get video content: ${contentResponse.status}`,
            )
          }
          throw new Error(
            `Failed to get video content: ${contentResponse.status}`,
          )
        }

        // The response is the raw video file - convert to base64 data URL
        const videoBlob = await contentResponse.blob()
        const buffer = await videoBlob.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const mimeType =
          contentResponse.headers.get('content-type') || 'video/mp4'

        return {
          jobId,
          url: `data:${mimeType};base64,${base64}`,
          expiresAt: undefined, // Data URLs don't expire
        }
      }

      return {
        jobId,
        url: response.url,
        expiresAt: response.expires_at
          ? new Date(response.expires_at)
          : undefined,
      }
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`Video job not found: ${jobId}`)
      }
      if (error.status === 400) {
        throw new Error(
          `Video is not ready for download. Check status first. Job ID: ${jobId}`,
        )
      }
      throw error
    }
  }

  private buildRequest(
    options: VideoGenerationOptions<OpenAIVideoProviderOptions>,
  ): OpenAI_SDK.Videos.VideoCreateParams {
    const { model, prompt, size, duration, modelOptions } = options

    const request: OpenAI_SDK.Videos.VideoCreateParams = {
      model: model as VideoModel,
      prompt,
    }

    // Add size/resolution
    // Supported: '1280x720', '720x1280', '1792x1024', '1024x1792'
    if (size) {
      request.size = size as OpenAI_SDK.Videos.VideoCreateParams['size']
    } else if (modelOptions?.size) {
      request.size = modelOptions.size
    }

    // Add seconds (duration)
    // Supported: '4', '8', or '12' - yes, the API wants strings
    const seconds = duration ?? modelOptions?.seconds
    if (seconds !== undefined) {
      request.seconds = toApiSeconds(seconds)
    }

    return request
  }

  private mapStatus(
    apiStatus: string,
  ): 'pending' | 'processing' | 'completed' | 'failed' {
    switch (apiStatus) {
      case 'queued':
      case 'pending':
        return 'pending'
      case 'processing':
      case 'in_progress':
        return 'processing'
      case 'completed':
      case 'succeeded':
        return 'completed'
      case 'failed':
      case 'error':
      case 'cancelled':
        return 'failed'
      default:
        return 'processing'
    }
  }
}

/**
 * Creates an OpenAI video adapter with an explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'sora-2')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI video adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiVideo('sora-2', 'your-api-key');
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A beautiful sunset over the ocean'
 * });
 * ```
 */
export function createOpenaiVideo<TModel extends OpenAIVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIVideoConfig, 'apiKey'>,
): OpenAIVideoAdapter<TModel> {
  return new OpenAIVideoAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI video adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'sora-2')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI video adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiVideo('sora-2');
 *
 * // Create a video generation job
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A cat playing piano'
 * });
 *
 * // Poll for status
 * const status = await getVideoJobStatus({
 *   adapter,
 *   jobId
 * });
 * ```
 */
export function openaiVideo<TModel extends OpenAIVideoModel>(
  model: TModel,
  config?: Omit<OpenAIVideoConfig, 'apiKey'>,
): OpenAIVideoAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiVideo(model, apiKey, config)
}
