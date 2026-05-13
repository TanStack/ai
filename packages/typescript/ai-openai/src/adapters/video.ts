import OpenAI from 'openai'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  toApiSeconds,
  validateVideoSeconds,
  validateVideoSize,
} from '../video/video-provider-options'
import type { VideoModel } from 'openai/resources'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIVideoModel } from '../model-meta'
import type {
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName,
  OpenAIVideoProviderOptions,
} from '../video/video-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Threshold for emitting a "this download will probably OOM serverless
 * runtimes" warning. Anything larger than this (in bytes) gets surfaced via
 * console.warn — workers and small isolates routinely run out of memory once
 * a downloaded video is base64-encoded.
 */
const LARGE_MEDIA_BUFFER_BYTES = 10 * 1024 * 1024

function warnIfLargeMediaBuffer(byteLength: number, source: string): void {
  if (byteLength <= LARGE_MEDIA_BUFFER_BYTES) return
  console.warn(
    `[openai.${source}] downloaded ${(byteLength / 1024 / 1024).toFixed(1)} MiB into memory before base64 encoding. ` +
      `Workers/serverless runtimes commonly run out of memory above ~10 MiB. ` +
      `Consider streaming the video through a CDN or your own storage layer instead.`,
  )
}

/**
 * Configuration for OpenAI video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenAIVideoConfig extends OpenAIClientConfig {}

/**
 * OpenAI Video Generation Adapter (Sora-2). Job/polling architecture.
 *
 * @experimental Video generation is an experimental feature and may change.
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

  protected client: OpenAI
  protected clientConfig: OpenAIVideoConfig

  constructor(config: OpenAIVideoConfig, model: TModel) {
    super(config, model)
    this.clientConfig = config
    this.client = new OpenAI(config)
  }

  async createVideoJob(
    options: VideoGenerationOptions<OpenAIVideoProviderOptions>,
  ): Promise<VideoJobResult> {
    const { model, size, duration, modelOptions } = options

    validateVideoSize(model, size)
    const seconds = duration ?? modelOptions?.seconds
    validateVideoSeconds(model, seconds)

    const request: OpenAI_SDK.Videos.VideoCreateParams = {
      model: model as VideoModel,
      prompt: options.prompt,
    }
    if (size) {
      request.size = size as OpenAI_SDK.Videos.VideoCreateParams['size']
    } else if (modelOptions?.size) {
      request.size = modelOptions.size
    }
    if (seconds !== undefined) {
      request.seconds = toApiSeconds(seconds)
    }

    try {
      options.logger.request(
        `activity=video.create provider=${this.name} model=${model} size=${request.size ?? 'default'} seconds=${request.seconds ?? 'default'}`,
        { provider: this.name, model },
      )
      const videosClient = this.getVideosClient()
      const response = await videosClient.create(request)
      return { jobId: response.id, model }
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
   * The video API on the OpenAI SDK is still experimental and shipped on some
   * SDK versions but not others; access through `videosClient` lets us treat
   * the path uniformly even when the SDK lacks first-class typings here.
   */
  private getVideosClient(): {
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
        return { jobId, status: 'failed', error: 'Job not found' }
      }
      throw error
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    try {
      const videosClient = this.getVideosClient()

      // Prefer retrieve() because many openai-compatible backends (and the
      // aimock test harness) return the URL directly on the video resource
      // and do not implement a separate /content endpoint.
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

      // SDK download fall-through: try the various possible method names.
      if (typeof videosClient.downloadContent === 'function') {
        const contentResponse = await videosClient.downloadContent(jobId)
        const videoBlob = await contentResponse.blob()
        const buffer = await videoBlob.arrayBuffer()
        warnIfLargeMediaBuffer(buffer.byteLength, 'video.downloadContent')
        const base64 = arrayBufferToBase64(buffer)
        const mimeType =
          contentResponse.headers.get('content-type') || 'video/mp4'
        return {
          jobId,
          url: `data:${mimeType};base64,${base64}`,
          expiresAt: undefined,
        }
      }

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
          { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } },
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
        warnIfLargeMediaBuffer(buffer.byteLength, 'video.fetch')
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
      // object. Read as bytes + wrap in a data URL so callers see a playable
      // URL instead of an endpoint URL.
      const fallthroughBlob =
        typeof response?.blob === 'function'
          ? await response.blob()
          : response instanceof Blob
            ? response
            : null
      if (!fallthroughBlob) {
        throw new Error(
          `Video content download via SDK fall-through returned an unexpected shape (no blob()).`,
        )
      }
      const fallthroughBuffer = await fallthroughBlob.arrayBuffer()
      warnIfLargeMediaBuffer(fallthroughBuffer.byteLength, 'video.sdkFallthrough')
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

export function createOpenaiVideo<TModel extends OpenAIVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIVideoConfig, 'apiKey'>,
): OpenAIVideoAdapter<TModel> {
  return new OpenAIVideoAdapter({ apiKey, ...config }, model)
}

export function openaiVideo<TModel extends OpenAIVideoModel>(
  model: TModel,
  config?: Omit<OpenAIVideoConfig, 'apiKey'>,
): OpenAIVideoAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiVideo(model, apiKey, config)
}
