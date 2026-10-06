import OpenAI from 'openai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { imagePartToFile } from '../image/image-input-to-file'
import {
  getOpenAIVideoDurationOptions,
  toApiSeconds,
  validateVideoSeconds,
  validateVideoSize,
} from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoStreamResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIVideoModel } from '../model-meta'
import type {
  OpenAIVideoModelDurationByName,
  OpenAIVideoModelInputModalitiesByName,
  OpenAIVideoModelProviderOptionsByName,
  OpenAIVideoModelSizeByName,
  OpenAIVideoProviderOptions,
  OpenAIVideoSeconds,
} from '../video/video-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenAIVideoConfig extends OpenAIClientConfig {
  /**
   * Opt into fetching HTTP(S) image URL inputs for Sora's `input_reference`.
   * The endpoint requires uploaded file bytes (no URL passthrough), so an
   * HTTP(S) URL has to be downloaded and buffered in memory — which can OOM
   * constrained runtimes (e.g. Cloudflare Workers). When `false` (the
   * default), HTTP(S) URL image inputs throw; pass a `data:` URI, or set this
   * to `true` to opt into buffering.
   */
  allowUrlFetch?: boolean
}

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
  OpenAIVideoModelSizeByName,
  OpenAIVideoModelInputModalitiesByName,
  OpenAIVideoModelDurationByName
> {
  readonly name = 'openai' as const

  protected client: OpenAI
  protected clientConfig: OpenAIVideoConfig

  constructor(config: OpenAIVideoConfig, model: TModel) {
    // `VideoAdapterConfig` declares its optional fields without `| undefined`,
    // which collides with `OpenAIClientConfig` fields like `timeout?: number | undefined`.
    // We hold our own typed copy on `clientConfig` and pass an empty object up.
    super({}, model)
    this.clientConfig = config
    const { allowUrlFetch: _allowUrlFetch, ...clientOptions } = config
    this.client = new OpenAI(clientOptions)
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      OpenAIVideoProviderOptions,
      OpenAIVideoModelSizeByName[TModel],
      OpenAIVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { model, size, duration, modelOptions } = options

    const resolvedSize = size ?? modelOptions?.size
    validateVideoSize(model, resolvedSize)
    const seconds = duration ?? modelOptions?.seconds
    validateVideoSeconds(model, seconds)

    const resolved = resolveMediaPrompt(options.prompt)

    if (resolved.videos.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support video prompt parts (model: ${model}).`,
      )
    }
    if (resolved.audios.length > 0) {
      throw new Error(
        `${this.name}.createVideoJob does not support audio prompt parts (model: ${model}).`,
      )
    }
    if (resolved.images.length > 1) {
      throw new Error(
        `${this.name}: Sora accepts at most one input_reference image; received ${resolved.images.length}.`,
      )
    }

    const request: OpenAI_SDK.Videos.VideoCreateParams = {
      model,
      prompt: resolved.text,
    }
    const [inputReference] = resolved.images
    if (inputReference) {
      // Sora's `input_reference` is a single Uploadable; convert TanStack
      // ImagePart (URL or base64) → File before handing it to the SDK.
      request.input_reference = await imagePartToFile(
        inputReference,
        'input-reference',
        this.clientConfig.allowUrlFetch ?? false,
      )
    }
    // `VideoCreateParams.size` is `size?: VideoSize` (no `| undefined`), so we
    // narrow before assignment instead of casting from a `T | undefined` source.
    if (resolvedSize) {
      request.size = resolvedSize
    }
    if (seconds !== undefined) {
      const apiSeconds = toApiSeconds(seconds)
      if (apiSeconds !== undefined) {
        request.seconds = apiSeconds
      }
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
    downloadContent: (id: string) => Promise<Response>
  } {
    return (this.client as { videos: any }).videos
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    try {
      const videosClient = this.getVideosClient()
      const response = await videosClient.retrieve(jobId)
      // `VideoStatusResult` declares optional fields without `| undefined`;
      // spread conditionally so we omit absent fields rather than assigning
      // `undefined`.
      return {
        jobId,
        status: this.mapStatus(response.status),
        progress: response.progress,
        ...(response.error?.message !== undefined && {
          error: response.error.message,
        }),
      }
    } catch (error: any) {
      if (error.status === 404) {
        return { jobId, status: 'failed', error: 'Job not found' }
      }
      throw error
    }
  }

  override async getVideo(
    jobId: string,
  ): Promise<VideoUrlResult | VideoStreamResult> {
    try {
      const videosClient = this.getVideosClient()

      // Prefer retrieve() because many openai-compatible backends (and the
      // aimock test harness) return the URL directly on the video resource
      // and do not implement a separate /content endpoint.
      const videoInfo = await videosClient.retrieve(jobId)
      if (videoInfo.url) {
        // `VideoUrlResult.expiresAt` is `expiresAt?: Date` without `| undefined`;
        // omit the field when the API didn't return an expiry.
        return {
          jobId,
          url: videoInfo.url,
          ...(videoInfo.expires_at !== undefined && {
            expiresAt: new Date(videoInfo.expires_at),
          }),
        }
      }

      // No URL: hand the download stream to generation middleware (which
      // stores it and sets the URL) instead of buffering the whole video.
      const response = await videosClient.downloadContent(jobId)
      if (!response.body) throw new Error('Video download returned no body')
      return {
        jobId,
        body: response.body,
        contentType: response.headers.get('content-type') || 'video/mp4',
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

  override availableDurations(): DurationOptions<OpenAIVideoSeconds> {
    return getOpenAIVideoDurationOptions(this.model)
  }

  /**
   * Returns the API string (`'4' | '8' | '12'`). Ties keep the earlier
   * option, so `6` and `"6s"` snap to `'4'`.
   */
  override snapDuration(
    input: number | string,
  ): OpenAIVideoSeconds | undefined {
    return snapToDurationOption(
      input,
      getOpenAIVideoDurationOptions(this.model),
    )
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
