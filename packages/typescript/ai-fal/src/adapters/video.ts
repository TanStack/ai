import { fal } from '@fal-ai/client'
import { BaseVideoAdapter, snapToDurationOption } from '@tanstack/ai/adapters'
import { configureFalClient, generateId as utilGenerateId } from '../utils'
import {
  getFalVideoDurationOptions,
  mapVideoSizeToFalFormat,
} from '../video/video-provider-options'
import type { DurationOptions } from '@tanstack/ai/adapters'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type {
  FalModel,
  FalModelInput,
  FalModelVideoDuration,
  FalModelVideoSize,
  FalVideoProviderOptions,
} from '../model-meta'
import type { FalClientConfig } from '../utils'

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
  Record<TModel, FalModelVideoDuration<TModel>>
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
      FalModelVideoSize<TModel>,
      FalModelVideoDuration<TModel>
    >,
  ): Promise<VideoJobResult> {
    const { prompt, size, duration, modelOptions, logger } = options

    logger.request(`activity=generateVideo provider=fal model=${this.model}`, {
      provider: 'fal',
      model: this.model,
    })

    try {
      const sizeParams = mapVideoSizeToFalFormat(size)

      // Omit `duration` for models whose API doesn't accept it (kind: 'none').
      // For models with discrete/range constraints, duration was already typed
      // to a valid value via VideoDurationForAdapter, so pass through as-is.
      const supportsDuration =
        getFalVideoDurationOptions(this.model).kind !== 'none'

      const input = {
        ...modelOptions,
        ...sizeParams,
        prompt,
        ...(supportsDuration && duration !== undefined ? { duration } : {}),
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

  override availableDurations(): DurationOptions<FalModelVideoDuration<TModel>> {
    return getFalVideoDurationOptions(this.model) as DurationOptions<
      FalModelVideoDuration<TModel>
    >
  }

  override snapDuration(
    seconds: number,
  ): FalModelVideoDuration<TModel> | undefined {
    return snapToDurationOption(
      seconds,
      this.availableDurations(),
    ) as FalModelVideoDuration<TModel> | undefined
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

    return {
      jobId,
      url,
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
