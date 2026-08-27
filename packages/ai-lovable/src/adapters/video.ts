import OpenAI from 'openai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import {
  getLovableApiKeyFromEnv,
  openaiRequestOptions,
  withLovableDefaults,
} from '../utils/client'
import { imagePartToFile } from '../image/image-input-to-file'
import {
  toApiSeconds,
  validateHighResDuration,
  validateVideoSeconds,
  validateVideoSize,
} from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  LovableVideoModel,
  LovableVideoModelDurationByName,
  LovableVideoModelInputModalitiesByName,
  LovableVideoModelProviderOptionsByName,
  LovableVideoModelSizeByName,
} from '../model-meta'
import type {
  LovableVideoDuration,
  LovableVideoProviderOptions,
} from '../video/video-provider-options'
import type { LovableClientConfig } from '../utils/client'

const LARGE_MEDIA_BUFFER_BYTES = 10 * 1024 * 1024
const VIDEO_DURATIONS = [
  4, 6, 8,
] as const satisfies ReadonlyArray<LovableVideoDuration>

function warnIfLargeMediaBuffer(byteLength: number, source: string): void {
  if (byteLength <= LARGE_MEDIA_BUFFER_BYTES) return
  console.warn(
    `[lovable.${source}] downloaded ${(byteLength / 1024 / 1024).toFixed(1)} MiB into memory before base64 encoding. ` +
      `Workers/serverless runtimes commonly run out of memory above ~10 MiB. ` +
      `Consider streaming the video through a CDN or your own storage layer instead.`,
  )
}

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export interface LovableVideoConfig extends LovableClientConfig {
  /**
     * Opt into fetching HTTP(S) image URL inputs for `input_reference`.
     * The endpoint requires uploaded file bytes, so an HTTP(S) URL has to be
     * downloaded and buffered in memory. When `false` (the default), HTTP(S)
     * URL image inputs throw.
     */
  allowUrlFetch?: boolean
}

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export class LovableVideoAdapter<
  TModel extends LovableVideoModel,
> extends BaseVideoAdapter<
  TModel,
  LovableVideoProviderOptions,
  LovableVideoModelProviderOptionsByName,
  LovableVideoModelSizeByName,
  LovableVideoModelInputModalitiesByName,
  LovableVideoModelDurationByName
> {
  readonly name = 'lovable' as const

  protected client: OpenAI
  protected clientConfig: LovableVideoConfig

  constructor(config: LovableVideoConfig, model: TModel) {
    super({}, model)
    this.clientConfig = config
    const { allowUrlFetch: _allowUrlFetch, ...clientOptions } = config
    this.client = new OpenAI(withLovableDefaults(clientOptions))
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      LovableVideoProviderOptions,
      LovableVideoModelSizeByName[TModel],
      LovableVideoModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult> {
    const { model, size, duration, modelOptions } = options

    const resolvedSize = size ?? modelOptions?.size
    validateVideoSize(model, resolvedSize)
    const seconds = duration ?? modelOptions?.seconds
    validateVideoSeconds(model, seconds)
    validateHighResDuration(model, resolvedSize, seconds)

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
        `${this.name}: video models accept at most one input_reference image; received ${resolved.images.length}.`,
      )
    }

    const request: OpenAI_SDK.Videos.VideoCreateParams = {
      model,
      prompt: resolved.text,
    }
    const [inputReference] = resolved.images
    if (inputReference) {
      request.input_reference = await imagePartToFile(
        inputReference,
        'input-reference',
        this.clientConfig.allowUrlFetch ?? false,
        options.abortSignal,
      )
    }
    if (resolvedSize) {
      // Gateway Veo sizes include 1080p and 4K, which are not in the OpenAI SDK union.
      request.size = resolvedSize as OpenAI_SDK.Videos.VideoSize
    }
    if (seconds !== undefined) {
      const apiSeconds = toApiSeconds(seconds)
      if (apiSeconds !== undefined) {
        // Gateway Veo clips can be 6 seconds. The OpenAI SDK union is 4/8/12.
        request.seconds = apiSeconds as OpenAI_SDK.Videos.VideoSeconds
      }
    }

    try {
      options.logger.request(
        `activity=video.create provider=${this.name} model=${model} size=${request.size ?? 'default'} seconds=${request.seconds ?? 'default'}`,
        { provider: this.name, model },
      )
      const response = await this.client.videos.create(
        request,
        openaiRequestOptions(options.abortSignal),
      )
      return { jobId: response.id, model }
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.createVideoJob fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createVideoJob failed`),
        source: `${this.name}.createVideoJob`,
      })
      throw error
    }
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    try {
      const response = await this.client.videos.retrieve(jobId)
      return {
        jobId,
        status: this.mapStatus(response.status),
        progress: response.progress,
        ...(response.error?.message !== undefined && {
          error: response.error.message,
        }),
      }
    } catch (error: unknown) {
      if (isHttpStatus(error, 404)) {
        return { jobId, status: 'failed', error: 'Job not found' }
      }
      throw error
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    try {
      const videoInfo = await this.client.videos.retrieve(jobId)
      const directUrl = videoResourceUrl(videoInfo)
      if (directUrl) {
        return {
          jobId,
          url: directUrl,
          ...(videoInfo.expires_at != null && {
            expiresAt: new Date(videoInfo.expires_at * 1000),
          }),
        }
      }

      const contentResponse = await this.client.videos.downloadContent(jobId)
      return dataUrlFromResponse(
        jobId,
        contentResponse,
        'video.downloadContent',
      )
    } catch (error: unknown) {
      if (isHttpStatus(error, 404)) {
        throw new Error(`Video job not found: ${jobId}`)
      }
      if (isHttpStatus(error, 400)) {
        throw new Error(
          `Video is not ready for download. Check status first. Job ID: ${jobId}`,
        )
      }
      throw error
    }
  }

  override availableDurations(): DurationOptions<LovableVideoDuration> {
    return { kind: 'discrete', values: VIDEO_DURATIONS }
  }

  override snapDuration(seconds: number): LovableVideoDuration | undefined {
    return snapToDurationOption(seconds, this.availableDurations())
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

async function dataUrlFromResponse(
  jobId: string,
  contentResponse: Response,
  source: string,
): Promise<VideoUrlResult> {
  const videoBlob = await contentResponse.blob()
  const buffer = await videoBlob.arrayBuffer()
  warnIfLargeMediaBuffer(buffer.byteLength, source)
  const base64 = arrayBufferToBase64(buffer)
  const mimeType = contentResponse.headers.get('content-type') || 'video/mp4'
  return {
    jobId,
    url: `data:${mimeType};base64,${base64}`,
  }
}

function videoResourceUrl(video: OpenAI_SDK.Videos.Video): string | undefined {
  const extra = video as OpenAI_SDK.Videos.Video & { url?: string }
  if (extra.url && extra.url.length > 0) {
    return extra.url
  }
  return undefined
}

function isHttpStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === status
  )
}

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export function createLovableVideo<TModel extends LovableVideoModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<LovableVideoConfig, 'apiKey'>,
): LovableVideoAdapter<TModel> {
  return new LovableVideoAdapter({ apiKey, ...config }, model)
}

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export function lovableVideo<TModel extends LovableVideoModel>(
  model: TModel,
  config?: Omit<LovableVideoConfig, 'apiKey'>,
): LovableVideoAdapter<TModel> {
  return createLovableVideo(model, getLovableApiKeyFromEnv(), config)
}
