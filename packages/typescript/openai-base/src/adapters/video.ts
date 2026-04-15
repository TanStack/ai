import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { createOpenAICompatibleClient } from '../utils/client'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/**
 * OpenAI-Compatible Video Generation Adapter
 *
 * A generalized base class for providers that implement OpenAI-compatible video
 * generation APIs. Uses a job/polling architecture for async video generation.
 *
 * Providers can extend this class and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override validation or request building methods as needed
 *
 * All methods that validate inputs, build requests, or map responses are `protected`
 * so subclasses can override them.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export class OpenAICompatibleVideoAdapter<
  TModel extends string,
  TProviderOptions extends object = Record<string, any>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
> extends BaseVideoAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName
> {
  readonly name: string

  protected client: OpenAI_SDK
  protected clientConfig: OpenAICompatibleClientConfig

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super(config, model)
    this.name = name
    this.clientConfig = config
    this.client = createOpenAICompatibleClient(config)
  }

  /**
   * Create a new video generation job.
   *
   * @experimental Video generation is an experimental feature and may change.
   */
  async createVideoJob(
    options: VideoGenerationOptions<TProviderOptions>,
  ): Promise<VideoJobResult> {
    const { model, size, duration, modelOptions } = options

    // Validate inputs
    this.validateVideoSize(model, size)
    const seconds = duration ?? (modelOptions as any)?.seconds
    this.validateVideoSeconds(model, seconds)

    // Build request
    const request = this.buildRequest(options)

    try {
      const client = this.client as any
      const response = await client.videos.create(request)

      return {
        jobId: response.id,
        model,
      }
    } catch (error: any) {
      if (error?.message?.includes('videos') || error?.code === 'invalid_api') {
        throw new Error(
          `Video generation API is not available. The API may require special access. ` +
            `Original error: ${error.message}`,
        )
      }
      throw error
    }
  }

  /**
   * Get the current status of a video generation job.
   *
   * @experimental Video generation is an experimental feature and may change.
   */
  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    try {
      const client = this.client as any
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
   * @experimental Video generation is an experimental feature and may change.
   */
  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    try {
      const client = this.client as any

      let response: any

      if (typeof client.videos?.downloadContent === 'function') {
        // OpenAI SDK's downloadContent returns raw video bytes as a Response
        const contentResponse = await client.videos.downloadContent(jobId)
        const videoBlob = await contentResponse.blob()
        const buffer = await videoBlob.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const mimeType =
          contentResponse.headers.get('content-type') || 'video/mp4'
        return {
          jobId,
          url: `data:${mimeType};base64,${base64}`,
          expiresAt: undefined,
        }
      } else if (typeof client.videos?.content === 'function') {
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
              ? new Date(videoInfo.expires_at * 1000)
              : undefined,
          }
        }

        // Fetch and return a data URL
        const baseUrl = this.clientConfig.baseURL || 'https://api.openai.com/v1'
        const apiKey = this.clientConfig.apiKey

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

        const videoBlob = await contentResponse.blob()
        const buffer = await videoBlob.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const mimeType =
          contentResponse.headers.get('content-type') || 'video/mp4'

        return {
          jobId,
          url: `data:${mimeType};base64,${base64}`,
          expiresAt: undefined,
        }
      }

      return {
        jobId,
        url: response.url,
        expiresAt: response.expires_at
          ? new Date(response.expires_at * 1000)
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

  protected buildRequest(
    options: VideoGenerationOptions<TProviderOptions>,
  ): Record<string, any> {
    const { model, prompt, size, duration, modelOptions } = options

    const request: Record<string, any> = {
      model,
      prompt,
    }

    if (size) {
      request['size'] = size
    } else if ((modelOptions as any)?.size) {
      request['size'] = (modelOptions as any).size
    }

    const seconds = duration ?? (modelOptions as any)?.seconds
    if (seconds !== undefined) {
      request['seconds'] = String(seconds)
    }

    return request
  }

  protected validateVideoSize(_model: string, _size?: string): void {
    // Default: no size validation — subclasses can override
  }

  protected validateVideoSeconds(
    _model: string,
    _seconds?: number | string,
  ): void {
    // Default: no duration validation — subclasses can override
  }

  protected mapStatus(
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
