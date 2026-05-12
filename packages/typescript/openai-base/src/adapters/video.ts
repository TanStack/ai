import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
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
 * Threshold for emitting a "this download will probably OOM serverless
 * runtimes" warning. Anything larger than this (in bytes) gets surfaced via
 * console.warn — workers and small isolates routinely run out of memory once
 * a downloaded video is base64-encoded (the encoded form is ~33% larger and
 * resides in V8 heap rather than streaming through the runtime's network
 * layer).
 */
const LARGE_MEDIA_BUFFER_BYTES = 10 * 1024 * 1024

function warnIfLargeMediaBuffer(
  byteLength: number,
  source: string,
  providerName: string,
): void {
  if (byteLength <= LARGE_MEDIA_BUFFER_BYTES) return
  // No InternalLogger plumbed through to these download paths yet; surface
  // via console.warn so Workers / Lambda dashboards still capture it.
  console.warn(
    `[${providerName}.${source}] downloaded ${(byteLength / 1024 / 1024).toFixed(1)} MiB into memory before base64 encoding. ` +
      `Workers/serverless runtimes commonly run out of memory above ~10 MiB. ` +
      `Consider streaming the video through a CDN or your own storage layer instead.`,
  )
}

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
      options.logger.request(
        `activity=video.create provider=${this.name} model=${model} size=${request.size ?? 'default'} seconds=${request.seconds ?? 'default'}`,
        { provider: this.name, model },
      )
      // The video API on the OpenAI SDK is still experimental and shipped on
      // some SDK versions but not others; access through `videosClient` lets
      // subclasses override the entry point or supply a polyfill without
      // forcing every call site through `as any`.
      const videosClient = this.getVideosClient()
      const response = await videosClient.create(request)

      return {
        jobId: response.id,
        model,
      }
    } catch (error: any) {
      options.logger.errors(`${this.name}.createVideoJob fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createVideoJob failed`),
        source: `${this.name}.createVideoJob`,
      })
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
   * Returns the underlying OpenAI Videos resource. Pulled out as a protected
   * accessor so subclasses targeting forks of the SDK can swap the access
   * path without forcing each call site to cast through `any`.
   */
  protected getVideosClient(): {
    create: (req: Record<string, any>) => Promise<{ id: string }>
    retrieve: (id: string) => Promise<{
      id: string
      status: string
      progress?: number
      url?: string
      expires_at?: number
      error?: { message?: string }
    }>
    downloadContent?: (id: string) => Promise<Response>
    content?: (id: string) => Promise<unknown>
    getContent?: (id: string) => Promise<unknown>
    download?: (id: string) => Promise<unknown>
  } {
    return (this.client as unknown as { videos: any }).videos
  }

  /**
   * Get the current status of a video generation job.
   *
   * @experimental Video generation is an experimental feature and may change.
   */
  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    try {
      const videosClient = this.getVideosClient()
      const response = await videosClient.retrieve(jobId)

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
      const videosClient = this.getVideosClient()

      // Prefer retrieve() because many openai-compatible backends (and the
      // aimock test harness) return the URL directly on the video resource
      // and do not implement a separate /content endpoint. Subclasses can
      // override this method if they need to download raw bytes via
      // downloadContent()/content().
      const videoInfo = await videosClient.retrieve(jobId)
      if (videoInfo.url) {
        return {
          jobId,
          url: videoInfo.url,
          expiresAt: videoInfo.expires_at
            ? new Date(videoInfo.expires_at)
            : undefined,
        }
      }

      // SDK download fall-through: try the various possible method names in
      // decreasing order of modernity.
      if (typeof videosClient.downloadContent === 'function') {
        const contentResponse = await videosClient.downloadContent(jobId)
        const videoBlob = await contentResponse.blob()
        const buffer = await videoBlob.arrayBuffer()
        warnIfLargeMediaBuffer(
          buffer.byteLength,
          'video.downloadContent',
          this.name,
        )
        const base64 = arrayBufferToBase64(buffer)
        const mimeType =
          contentResponse.headers.get('content-type') || 'video/mp4'
        return {
          jobId,
          url: `data:${mimeType};base64,${base64}`,
          expiresAt: undefined,
        }
      }

      // The remaining SDK fall-throughs all return a binary payload
      // (Blob/Response/ArrayBuffer-shaped), NOT an `{ url, expires_at }`
      // object the way the bottom return assumed. Convert to a data URL
      // here so the caller actually receives a usable URL.
      let response: any
      if (typeof videosClient.content === 'function') {
        response = await videosClient.content(jobId)
      } else if (typeof videosClient.getContent === 'function') {
        response = await videosClient.getContent(jobId)
      } else if (typeof videosClient.download === 'function') {
        response = await videosClient.download(jobId)
      } else {
        // Last resort: raw fetch with auth header.
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
        warnIfLargeMediaBuffer(buffer.byteLength, 'video.fetch', this.name)
        const base64 = arrayBufferToBase64(buffer)
        const mimeType =
          contentResponse.headers.get('content-type') || 'video/mp4'

        return {
          jobId,
          url: `data:${mimeType};base64,${base64}`,
          expiresAt: undefined,
        }
      }

      // The fall-through SDK methods produce a Blob-ish or fetch-`Response`-ish
      // object. Read it as bytes and wrap in a data URL so callers see an
      // actual playable URL instead of the API endpoint URL (which is what
      // `response.url` would be on a fetch Response).
      const fallthroughBlob =
        typeof response?.blob === 'function'
          ? await response.blob()
          : response instanceof Blob
            ? response
            : null
      if (!fallthroughBlob) {
        throw new Error(
          `Video content download via SDK fall-through returned an unexpected shape (no blob()). ` +
            `Override getVideoUrl() in your subclass to handle this provider.`,
        )
      }
      const fallthroughBuffer = await fallthroughBlob.arrayBuffer()
      warnIfLargeMediaBuffer(
        fallthroughBuffer.byteLength,
        'video.sdkFallthrough',
        this.name,
      )
      const fallthroughBase64 = arrayBufferToBase64(fallthroughBuffer)
      const fallthroughMime =
        (typeof response?.headers?.get === 'function'
          ? response.headers.get('content-type')
          : undefined) ||
        fallthroughBlob.type ||
        'video/mp4'
      return {
        jobId,
        url: `data:${fallthroughMime};base64,${fallthroughBase64}`,
        expiresAt: undefined,
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
