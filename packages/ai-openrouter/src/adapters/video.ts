import { OpenRouter } from '@openrouter/sdk'
import { buildBaseUsage, resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import {
  getVideoModelMeta,
  validateVideoDuration,
  validateVideoSize,
} from '../video/video-provider-options'
import type {
  OpenRouterVideoModel,
  OpenRouterVideoModelInputModalitiesByName,
  OpenRouterVideoModelProviderOptionsByName,
  OpenRouterVideoModelSizeByName,
  OpenRouterVideoProviderOptions,
} from '../video/video-provider-options'
import type {
  AspectRatio,
  ContentPartImage,
  FrameImage,
  Resolution,
  VideoGenerationRequest,
  VideoGenerationResponse,
} from '@openrouter/sdk/models'
import type {
  ImagePart,
  MediaInputMetadata,
  TokenUsage,
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type { OpenRouterClientConfig } from '../utils'

/**
 * Configuration for the OpenRouter video adapter.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenRouterVideoConfig extends OpenRouterClientConfig {
  /**
   * Injectable fetch implementation used for the authenticated video
   * content download (tests, custom runtimes). Defaults to the global
   * fetch.
   */
  fetch?: typeof globalThis.fetch
}

/**
 * Threshold for emitting a "this download will probably OOM serverless
 * runtimes" warning. Anything larger than this (in bytes) gets surfaced via
 * console.warn — workers and small isolates routinely run out of memory once
 * a downloaded video is base64-encoded.
 */
const LARGE_MEDIA_BUFFER_BYTES = 10 * 1024 * 1024

function warnIfLargeMediaBuffer(byteLength: number): void {
  if (byteLength <= LARGE_MEDIA_BUFFER_BYTES) return
  console.warn(
    `[openrouter.video] downloaded ${(byteLength / 1024 / 1024).toFixed(1)} MiB into memory before base64 encoding. ` +
      `Workers/serverless runtimes commonly run out of memory above ~10 MiB. ` +
      `Consider streaming the video through a CDN or your own storage layer instead.`,
  )
}

/**
 * Convert a TanStack ImagePart into the URL string accepted by OpenRouter's
 * video API image fields: public URLs pass through verbatim, data sources
 * become base64 data URIs. OpenRouter never fetches URLs through redirects
 * or bot checks on your behalf — pass directly accessible URLs.
 */
function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
  if (part.source.type === 'url') return part.source.value
  return `data:${part.source.mimeType};base64,${part.source.value}`
}

interface VideoImageFields {
  frameImages?: Array<FrameImage>
  inputReferences?: Array<ContentPartImage>
}

/**
 * Map the prompt's image parts onto OpenRouter's video request fields:
 *
 * - `metadata.role === 'start_frame'`             → `frame_images[]` with `frame_type: 'first_frame'`
 * - `metadata.role === 'end_frame'`               → `frame_images[]` with `frame_type: 'last_frame'`
 * - `metadata.role === 'reference' | 'character'` → `input_references[]`
 * - `metadata.role === 'mask' | 'control'`        → throws (no video routing)
 * - remaining parts (no role)                     → start frame (positional default)
 *
 * When both `frame_images` and `input_references` are present OpenRouter
 * treats the request as image-to-video and references take lower priority.
 * Frame roles are validated against the model's `supported_frame_images`
 * metadata when known.
 */
function mapImagePartsToVideoFields(
  model: string,
  images: Array<ImagePart<MediaInputMetadata>>,
): VideoImageFields {
  if (images.length === 0) return {}

  const starts: Array<string> = []
  const ends: Array<string> = []
  const references: Array<string> = []
  for (const part of images) {
    const role = part.metadata?.role
    if (role === 'mask' || role === 'control') {
      throw new Error(
        `openrouter: metadata.role === '${role}' is not supported for video generation on model ${model}. Remove the role or use 'start_frame' / 'end_frame' / 'reference'.`,
      )
    }
    const url = imagePartToUrl(part)
    if (role === 'end_frame') ends.push(url)
    else if (role === 'reference' || role === 'character') references.push(url)
    // Unroled parts default to the start frame (image-to-video).
    else starts.push(url)
  }

  if (starts.length > 1) {
    throw new Error(
      `openrouter: at most one start-frame image is supported per request (received ${starts.length}). Mark additional images with metadata.role 'reference' or 'end_frame'.`,
    )
  }
  if (ends.length > 1) {
    throw new Error(
      `openrouter: at most one input with metadata.role === 'end_frame' is supported per request (received ${ends.length}).`,
    )
  }

  const supportedFrames = getVideoModelMeta(model)?.frameImages
  if (supportedFrames) {
    if (starts.length > 0 && !supportedFrames.includes('first_frame')) {
      throw new Error(
        `openrouter: model ${model} does not accept a start-frame image (supported frame images: ${supportedFrames.join(', ') || 'none'}).`,
      )
    }
    if (ends.length > 0 && !supportedFrames.includes('last_frame')) {
      throw new Error(
        `openrouter: model ${model} does not accept an end-frame image (supported frame images: ${supportedFrames.join(', ') || 'none'}).`,
      )
    }
  }

  const frameImages: Array<FrameImage> = [
    ...starts.map(
      (url): FrameImage => ({
        type: 'image_url',
        imageUrl: { url },
        frameType: 'first_frame',
      }),
    ),
    ...ends.map(
      (url): FrameImage => ({
        type: 'image_url',
        imageUrl: { url },
        frameType: 'last_frame',
      }),
    ),
  ]

  return {
    ...(frameImages.length > 0 ? { frameImages } : {}),
    ...(references.length > 0
      ? {
          inputReferences: references.map(
            (url): ContentPartImage => ({
              type: 'image_url',
              imageUrl: { url },
            }),
          ),
        }
      : {}),
  }
}

/**
 * Map OpenRouter job status onto the TanStack video job status. OpenRouter
 * reports `pending → in_progress → completed | failed`, plus `cancelled` and
 * `expired` terminals.
 */
function mapStatus(
  apiStatus: VideoGenerationResponse['status'],
): VideoStatusResult['status'] {
  switch (apiStatus) {
    case 'pending':
      return 'pending'
    case 'in_progress':
      return 'processing'
    case 'completed':
      return 'completed'
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'failed'
    default:
      return 'processing'
  }
}

/**
 * Build TokenUsage from the job's usage block. Video generation bills by
 * cost, not tokens, so the token counts are zero and the gateway-reported
 * cost is surfaced via `usage.cost`.
 */
function buildVideoUsage(
  usage: VideoGenerationResponse['usage'],
): TokenUsage | undefined {
  if (usage?.cost == null) return undefined
  const result = buildBaseUsage({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  })
  result.cost = usage.cost
  return result
}

/**
 * OpenRouter Video Generation Adapter
 *
 * Tree-shakeable adapter for OpenRouter's dedicated async video generation
 * API (`POST /api/v1/videos`) — Seedance, Veo, Wan, Kling, Sora and others
 * through one gateway. Uses a jobs/polling architecture: submit a job, poll
 * `GET /api/v1/videos/{jobId}` until completed, then download from the
 * job's unsigned URLs.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export class OpenRouterVideoAdapter<
  TModel extends OpenRouterVideoModel,
> extends BaseVideoAdapter<
  TModel,
  OpenRouterVideoProviderOptions,
  OpenRouterVideoModelProviderOptionsByName,
  OpenRouterVideoModelSizeByName,
  OpenRouterVideoModelInputModalitiesByName
> {
  override readonly kind = 'video' as const
  readonly name = 'openrouter' as const

  private readonly client: OpenRouter
  private readonly clientConfig: OpenRouterVideoConfig

  constructor(config: OpenRouterVideoConfig, model: TModel) {
    super({}, model)
    this.clientConfig = config
    this.client = new OpenRouter({
      ...config,
      apiKey: config.apiKey,
      serverURL: config.baseURL,
    })
  }

  async createVideoJob(
    options: VideoGenerationOptions<OpenRouterVideoProviderOptions>,
  ): Promise<VideoJobResult> {
    const { size, duration, modelOptions, logger } = options

    const resolved = resolveMediaPrompt(options.prompt)
    if (resolved.videos.length > 0) {
      throw new Error(
        `openrouter.createVideoJob does not support video prompt parts (model: ${this.model}).`,
      )
    }
    if (resolved.audios.length > 0) {
      throw new Error(
        `openrouter.createVideoJob does not support audio prompt parts (model: ${this.model}).`,
      )
    }

    validateVideoSize(this.model, size)
    validateVideoDuration(this.model, duration)

    const imageFields = mapImagePartsToVideoFields(this.model, resolved.images)

    const request: VideoGenerationRequest = {
      model: this.model,
      prompt: resolved.text,
      ...imageFields,
      ...(size ? { size } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(modelOptions?.seed !== undefined ? { seed: modelOptions.seed } : {}),
      ...(modelOptions?.generateAudio !== undefined
        ? { generateAudio: modelOptions.generateAudio }
        : {}),
      ...(modelOptions?.callbackUrl
        ? { callbackUrl: modelOptions.callbackUrl }
        : {}),
      ...(modelOptions?.provider ? { provider: modelOptions.provider } : {}),
    }
    // The SDK types these as branded open enums; the per-model literal
    // unions derived from OPENROUTER_VIDEO_MODEL_META can be broader than
    // the SDK's enum members (e.g. grok-imagine-video's '3:2'), so narrow at
    // the boundary — the wire format is a plain string either way.
    if (modelOptions?.resolution) {
      request.resolution = modelOptions.resolution as Resolution
    }
    if (modelOptions?.aspectRatio) {
      request.aspectRatio = modelOptions.aspectRatio as AspectRatio
    }

    try {
      logger.request(
        `activity=video.create provider=${this.name} model=${this.model} size=${size ?? 'default'} duration=${duration ?? 'default'}`,
        { provider: this.name, model: this.model },
      )
      const response = await this.client.videoGeneration.generate({
        videoGenerationRequest: request,
      })
      return { jobId: response.id, model: this.model }
    } catch (error) {
      logger.errors(`${this.name}.createVideoJob fatal`, {
        error,
        source: `${this.name}.createVideoJob`,
      })
      throw error
    }
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    const response = await this.client.videoGeneration.getGeneration({ jobId })
    return {
      jobId,
      status: mapStatus(response.status),
      ...(response.error !== undefined ? { error: response.error } : {}),
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    const response = await this.client.videoGeneration.getGeneration({ jobId })
    const status = mapStatus(response.status)
    if (status === 'failed') {
      throw new Error(
        `openrouter: video job ${jobId} ${response.status}${response.error ? `: ${response.error}` : ''}`,
      )
    }
    const contentUrl = response.unsignedUrls?.[0]
    if (status !== 'completed' || !contentUrl) {
      throw new Error(
        `openrouter: video job ${jobId} has no downloadable content yet (status: ${response.status}). Poll until the job is completed before requesting the URL.`,
      )
    }

    // The job's `unsigned_urls` require the OpenRouter `Authorization`
    // header (verified live: plain GET returns 401), so they can't be
    // handed to a browser <video> tag. Download the content server-side and
    // return a data URL instead — same policy as the OpenAI video adapter.
    // Fetched directly rather than via the SDK's `getVideoContent`, whose
    // response matcher (as of @openrouter/sdk 0.12.35) only accepts
    // `application/octet-stream` while the live endpoint serves `video/mp4`.
    const doFetch = this.clientConfig.fetch ?? globalThis.fetch
    const contentResponse = await doFetch(contentUrl, {
      headers: { Authorization: `Bearer ${this.clientConfig.apiKey}` },
    })
    if (!contentResponse.ok) {
      throw new Error(
        `openrouter: failed to download video content for job ${jobId}: HTTP ${contentResponse.status}`,
      )
    }
    const buffer = await contentResponse.arrayBuffer()
    warnIfLargeMediaBuffer(buffer.byteLength)
    const base64 = arrayBufferToBase64(buffer)
    const mimeType = contentResponse.headers.get('content-type') || 'video/mp4'

    const usage = buildVideoUsage(response.usage)
    return {
      jobId,
      url: `data:${mimeType};base64,${base64}`,
      ...(usage ? { usage } : {}),
    }
  }
}

/**
 * Creates an OpenRouter video adapter with an explicit API key.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example
 * ```typescript
 * const adapter = createOpenRouterVideo('bytedance/seedance-2.0', 'your-api-key')
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A beautiful sunset over the ocean',
 * })
 * ```
 */
export function createOpenRouterVideo<TModel extends OpenRouterVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenRouterVideoConfig, 'apiKey'>,
): OpenRouterVideoAdapter<TModel> {
  return new OpenRouterVideoAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenRouter video adapter using the `OPENROUTER_API_KEY`
 * environment variable.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * @example
 * ```typescript
 * const adapter = openRouterVideo('google/veo-3.1')
 *
 * const { jobId } = await generateVideo({
 *   adapter,
 *   prompt: 'A cat playing piano in a jazz bar',
 * })
 *
 * const status = await getVideoJobStatus({ adapter, jobId })
 * ```
 */
export function openRouterVideo<TModel extends OpenRouterVideoModel>(
  model: TModel,
  config?: Omit<OpenRouterVideoConfig, 'apiKey'>,
): OpenRouterVideoAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterVideo(model, apiKey, config)
}
