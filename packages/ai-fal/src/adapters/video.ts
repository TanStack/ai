import { fal } from '@fal-ai/client'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import {
  configureFalClient,
  generateId as utilGenerateId,
} from '../utils/client'
import { buildFalUsage, takeBillableUnits } from '../utils/billing'
import { mapVideoSizeToFalFormat } from '../video/video-provider-options'
import { mapImageInputsToFalVideoFields } from '../image/image-inputs'
import type {
  AudioPart,
  MediaInputMetadata,
  VideoGenerationOptions,
  VideoJobResult,
  VideoPart,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type {
  FalModel,
  FalModelInput,
  FalModelVideoSize,
  FalVideoPromptModalitiesFor,
  FalVideoProviderOptions,
} from '../model-meta'
import type { FalClientConfig } from '../utils/client'

/**
 * Map video conditioning inputs onto fal field names.
 * Video-to-video endpoints on fal almost universally use `video_url`; the
 * occasional model takes `video_urls` (rare). Mirror the image-input logic
 * positionally with a `reference` role escape hatch via `reference_video_urls`.
 */
function mapVideoInputsToFalFields(
  videoInputs?: ReadonlyArray<VideoPart<MediaInputMetadata>>,
): Record<string, unknown> {
  if (!videoInputs || videoInputs.length === 0) return {}
  const references: Array<string> = []
  const sources: Array<string> = []
  for (const part of videoInputs) {
    const url = videoPartToUrl(part)
    if (
      part.metadata?.role === 'reference' ||
      part.metadata?.role === 'character'
    ) {
      references.push(url)
    } else {
      sources.push(url)
    }
  }
  const out: Record<string, unknown> = {}
  if (references.length > 0) out.reference_video_urls = references
  if (sources.length === 1) {
    out.video_url = sources[0]
  } else if (sources.length > 1) {
    out.video_urls = sources
  }
  return out
}

function mapAudioInputsToFalFields(
  audioInputs?: ReadonlyArray<AudioPart<MediaInputMetadata>>,
): Record<string, unknown> {
  if (!audioInputs || audioInputs.length === 0) return {}
  const [part, ...rest] = audioInputs
  if (!part || rest.length > 0) {
    throw new Error(
      `fal: exactly one audio prompt part is supported (received ${audioInputs.length}).`,
    )
  }
  return {
    audio_url:
      part.source.type === 'url'
        ? part.source.value
        : `data:${part.source.mimeType};base64,${part.source.value}`,
  }
}

function videoPartToUrl(part: VideoPart<MediaInputMetadata>): string {
  return part.source.type === 'url'
    ? part.source.value
    : `data:${part.source.mimeType};base64,${part.source.value}`
}

type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'

interface FalStatusResponse {
  status: FalQueueStatus
  queue_position?: number
  logs?: Array<{ message: string }>
}

interface FalVideoResultData {
  video?: { url: string }
  video_url?: string
}

/**
 * Maps fal.ai queue status to TanStack AI video status.
 *
 * Note: fal.ai does not return a FAILED queue status. Errors surface
 * as exceptions when fetching results from a COMPLETED job (e.g. 422
 * validation errors). Those are handled in getVideoUrl().
 */
function mapFalStatusToVideoStatus(
  falStatus: FalQueueStatus,
): VideoStatusResult['status'] {
  switch (falStatus) {
    case 'IN_QUEUE':
      return 'pending'
    case 'IN_PROGRESS':
      return 'processing'
    case 'COMPLETED':
      return 'completed'
    default:
      return 'processing'
  }
}

/**
 * fal.ai video generation adapter.
 * Supports MiniMax, Luma, Kling, Hunyuan, and other fal.ai video models.
 *
 * Uses fal.ai's comprehensive type system to provide autocomplete
 * and type safety for all supported video models.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export class FalVideoAdapter<TModel extends FalModel> extends BaseVideoAdapter<
  TModel,
  FalVideoProviderOptions<TModel>,
  Record<TModel, FalVideoProviderOptions<TModel>>,
  Record<TModel, FalModelVideoSize<TModel>>,
  Record<TModel, FalVideoPromptModalitiesFor<TModel>>
> {
  override readonly kind = 'video' as const
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    configureFalClient(config)
  }

  async createVideoJob(
    options: VideoGenerationOptions<
      FalVideoProviderOptions<TModel>,
      FalModelVideoSize<TModel>
    >,
  ): Promise<VideoJobResult> {
    const { size, duration, modelOptions, logger } = options

    logger.request(`activity=generateVideo provider=fal model=${this.model}`, {
      provider: 'fal',
      model: this.model,
    })

    try {
      const resolved = resolveMediaPrompt(options.prompt)
      const sizeParams = mapVideoSizeToFalFormat(size)
      const inputImageFields = mapImageInputsToFalVideoFields(
        this.model,
        resolved.images,
      )
      const videoFields = mapVideoInputsToFalFields(resolved.videos)
      const audioFields = mapAudioInputsToFalFields(resolved.audios)

      const input = {
        ...sizeParams,
        ...inputImageFields,
        ...videoFields,
        ...audioFields,
        // modelOptions applied after derived media fields so explicit user
        // overrides (video_url, reference_video_urls, audio_url, ...) win.
        ...modelOptions,
        // Media-only prompts omit the prompt field rather than sending an
        // empty string (e.g. pure image-to-video endpoints).
        ...(resolved.text ? { prompt: resolved.text } : {}),
        ...(duration ? { duration } : {}),
      } as FalModelInput<TModel>

      // Submit to queue and get request ID
      const { request_id } = await fal.queue.submit(this.model, {
        input,
      })

      return {
        jobId: request_id,
        model: this.model,
      }
    } catch (error) {
      logger.errors('fal.createVideoJob fatal', {
        error,
        source: 'fal.createVideoJob',
      })
      throw error
    }
  }

  async getVideoStatus(jobId: string): Promise<VideoStatusResult> {
    const statusResponse = (await fal.queue.status(this.model, {
      requestId: jobId,
      logs: true,
    })) as FalStatusResponse

    return {
      jobId,
      status: mapFalStatusToVideoStatus(statusResponse.status),
      ...(statusResponse.queue_position != null
        ? {
            progress: Math.max(0, 100 - statusResponse.queue_position * 10),
          }
        : {}),
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    let result
    try {
      result = await fal.queue.result(this.model, {
        requestId: jobId,
      })
    } catch (error: unknown) {
      // fal.ai may report COMPLETED status but throw on result fetch
      // (e.g. 422 validation errors). Extract the detailed error info.
      const err = error as { body?: { detail?: unknown }; message?: string }
      const detail = err.body?.detail
      if (Array.isArray(detail)) {
        const messages = detail.map(
          (d: { msg?: string; loc?: Array<string> }) =>
            d.loc ? `${d.loc.join('.')}: ${d.msg}` : d.msg,
        )
        throw new Error(`Video generation failed: ${messages.join('; ')}`)
      }
      throw new Error(
        `Failed to retrieve video result: ${err.message || String(error)}`,
      )
    }

    const data = result.data as FalVideoResultData

    // Different models return video URL in different formats
    const url = data.video?.url || data.video_url
    if (!url) {
      throw new Error('Video URL not found in response')
    }

    const usage = buildFalUsage(takeBillableUnits(result.requestId))

    return {
      jobId,
      url,
      ...(usage ? { usage } : {}),
    }
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }
}

/**
 * Create a fal.ai video adapter with an explicit API key.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function createFalVideo<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalVideoAdapter<TModel> {
  return new FalVideoAdapter(model, config)
}

/**
 * Create a fal.ai video adapter using config.apiKey or the FAL_KEY environment variable.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function falVideo<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalVideoAdapter<TModel> {
  return createFalVideo(model, config)
}
