import { OpenRouter } from '@openrouter/sdk'
import { buildBaseUsage, resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { getOpenRouterApiKeyFromEnv } from '../utils/client'
import {
  getVideoDurationOptions,
  getVideoModelMeta,
  validateVideoDuration,
  validateVideoSize,
} from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  OpenRouterVideoModel,
  OpenRouterVideoModelDurationByName,
  OpenRouterVideoModelInputModalitiesByName,
  OpenRouterVideoModelProviderOptionsByName,
  OpenRouterVideoModelSizeByName,
  OpenRouterVideoProviderOptions,
} from '../video/video-provider-options'
import type {
  ContentPartImage,
  FrameImage,
  VideoGenerationRequest,
  VideoGenerationRequestAspectRatio,
  VideoGenerationRequestResolution,
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
import type { OpenRouterClientConfig } from '../utils/client'

export interface OpenRouterVideoConfig extends OpenRouterClientConfig {}

const LARGE_MEDIA_BUFFER_BYTES = 10 * 1024 * 1024

function warnIfLargeMediaBuffer(byteLength: number): void {
  if (byteLength <= LARGE_MEDIA_BUFFER_BYTES) return
  console.warn(
    `[openrouter.video] downloaded ${(byteLength / 1024 / 1024).toFixed(1)} MiB into memory before base64 encoding. ` +
      `Workers/serverless runtimes commonly run out of memory above ~10 MiB. ` +
      `Consider streaming the video through a CDN or your own storage layer instead.`,
  )
}

function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
  if (part.source.type === 'url') return part.source.value
  return `data:${part.source.mimeType};base64,${part.source.value}`
}

interface VideoImageFields {
  frameImages?: Array<FrameImage>
  inputReferences?: Array<ContentPartImage>
}

function appendVideoImageByRole(
  model: string,
  part: ImagePart<MediaInputMetadata>,
  starts: Array<string>,
  ends: Array<string>,
  references: Array<string>,
): void {
  const role = part.metadata?.role
  const isUnsupportedImageRole = role === 'mask' || role === 'control'
  if (isUnsupportedImageRole) {
    throw new Error(
      `openrouter: metadata.role === '${role}' is not supported for video generation on model ${model}. Remove the role or use 'start_frame' / 'end_frame' / 'reference'.`,
    )
  }
  const url = imagePartToUrl(part)
  const isReferenceOrCharacterRole =
    role === 'reference' || role === 'character'
  if (role === 'end_frame') ends.push(url)
  else if (isReferenceOrCharacterRole) references.push(url)
  // Unroled parts default to the start frame (image-to-video).
  else starts.push(url)
}

function assertSupportedVideoFrames(
  model: string,
  starts: Array<string>,
  ends: Array<string>,
): void {
  const supportedFrames = getVideoModelMeta(model)?.frameImages
  if (!supportedFrames) return
  const isStartFrameUnsupported =
    starts.length > 0 && !supportedFrames.includes('first_frame')
  if (isStartFrameUnsupported) {
    throw new Error(
      `openrouter: model ${model} does not accept a start-frame image (supported frame images: ${supportedFrames.join(', ') || 'none'}).`,
    )
  }
  const isEndFrameUnsupported =
    ends.length > 0 && !supportedFrames.includes('last_frame')
  if (isEndFrameUnsupported) {
    throw new Error(
      `openrouter: model ${model} does not accept an end-frame image (supported frame images: ${supportedFrames.join(', ') || 'none'}).`,
    )
  }
}

function mapImagePartsToVideoFields(
  model: string,
  images: Array<ImagePart<MediaInputMetadata>>,
): VideoImageFields {
  if (images.length === 0) return {}

  const starts: Array<string> = []
  const ends: Array<string> = []
  const references: Array<string> = []
  for (const part of images) {
    appendVideoImageByRole(model, part, starts, ends, references)
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

  assertSupportedVideoFrames(model, starts, ends)

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

export class OpenRouterVideoAdapter<
  TModel extends OpenRouterVideoModel,
> extends BaseVideoAdapter<
  TModel,
  OpenRouterVideoProviderOptions,
  OpenRouterVideoModelProviderOptionsByName,
  OpenRouterVideoModelSizeByName,
  OpenRouterVideoModelInputModalitiesByName,
  OpenRouterVideoModelDurationByName
> {
  override readonly kind = 'video' as const
  readonly name = 'openrouter' as const

  private readonly client: OpenRouter

  constructor(config: OpenRouterVideoConfig, model: TModel) {
    super({}, model)
    this.client = new OpenRouter({
      ...config,
      apiKey: config.apiKey,
      serverURL: config.baseURL,
    })
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      OpenRouterVideoProviderOptions,
      OpenRouterVideoModelSizeByName[TModel],
      OpenRouterVideoModelDurationByName[TModel]
    >,
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
    if (modelOptions?.resolution) {
      request.resolution =
        modelOptions.resolution as VideoGenerationRequestResolution
    }
    if (modelOptions?.aspectRatio) {
      request.aspectRatio =
        modelOptions.aspectRatio as VideoGenerationRequestAspectRatio
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

  override availableDurations(): DurationOptions<
    OpenRouterVideoModelDurationByName[TModel]
  > {
    return getVideoDurationOptions(this.model)
  }

  override snapDuration(
    seconds: number,
  ): OpenRouterVideoModelDurationByName[TModel] | undefined {
    return snapToDurationOption(seconds, this.availableDurations())
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
    const hasNoDownloadableContent = status !== 'completed' || !contentUrl
    if (hasNoDownloadableContent) {
      throw new Error(
        `openrouter: video job ${jobId} has no downloadable content yet (status: ${response.status}). Poll until the job is completed before requesting the URL.`,
      )
    }

    let stream: ReadableStream<Uint8Array>
    try {
      stream = await this.client.videoGeneration.getVideoContent({ jobId })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        `openrouter: failed to download video content for job ${jobId}: ${detail}`,
      )
    }
    const buffer = await new Response(stream).arrayBuffer()
    warnIfLargeMediaBuffer(buffer.byteLength)
    const base64 = arrayBufferToBase64(buffer)
    const mimeType = 'video/mp4'

    const usage = buildVideoUsage(response.usage)
    return {
      jobId,
      url: `data:${mimeType};base64,${base64}`,
      ...(usage ? { usage } : {}),
    }
  }
}

export function createOpenRouterVideo<TModel extends OpenRouterVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenRouterVideoConfig, 'apiKey'>,
): OpenRouterVideoAdapter<TModel> {
  return new OpenRouterVideoAdapter({ apiKey, ...config }, model)
}

export function openRouterVideo<TModel extends OpenRouterVideoModel>(
  model: TModel,
  config?: Omit<OpenRouterVideoConfig, 'apiKey'>,
): OpenRouterVideoAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterVideo(model, apiKey, config)
}
