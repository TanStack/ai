import { fal } from '@fal-ai/client'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import { configureFalClient, generateId as utilGenerateId } from '../utils'
import type {
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type {
  FalModel,
  FalModelInput,
  FalVideoGenerationOptions,
  FalVideoProviderOptions,
} from '../model-meta'
import type { FalClientConfig } from '../utils'

type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'

const HEIGHT_TO_RESOLUTION: Record<number, string> = {
  240: '240p',
  360: '360p',
  480: '480p',
  512: '512p',
  520: '520p',
  540: '540p',
  576: '576p',
  580: '580p',
  720: '720p',
  768: '768p',
  1024: '1024p',
  1080: '1080p',
  1440: '1440p',
  2160: '4k',
}

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
  FalVideoProviderOptions<TModel>
> {
  readonly kind = 'video' as const
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    // Use accessor function to avoid merged type slowdown

    configureFalClient(config)
  }

  async createVideoJob(
    options: FalVideoGenerationOptions<TModel>,
  ): Promise<VideoJobResult> {
    const { prompt, size, duration, modelOptions } = options
    const sizeParams = size ? this.sizeToResolutionAspectRatio(size) : undefined

    const input = {
      ...modelOptions,
      prompt,
      ...(duration ? { duration } : {}),
      ...(sizeParams
        ? {
            resolution: sizeParams.resolution,
            aspect_ratio: sizeParams.aspectRatio,
          }
        : {}),
    } as FalModelInput<TModel>
    // Submit to queue and get request ID
    const { request_id } = await fal.queue.submit(this.model, {
      input,
    })

    return {
      jobId: request_id,
      model: this.model,
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
      progress:
        statusResponse.queue_position != null
          ? Math.max(0, 100 - statusResponse.queue_position * 10)
          : undefined,
    }
  }

  async getVideoUrl(jobId: string): Promise<VideoUrlResult> {
    const result = await fal.queue.result(this.model, {
      requestId: jobId,
    })

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

  /**
   * Convert WIDTHxHEIGHT size format to resolution and aspect ratio.
   */
  private sizeToResolutionAspectRatio(
    size: string,
  ): { resolution: string; aspectRatio: string } | undefined {
    const match = size.match(/^(\d+)x(\d+)$/)
    if (!match || !match[1] || !match[2]) return undefined

    const width = parseInt(match[1], 10)
    const height = parseInt(match[2], 10)

    // Map height to resolution string
    const resolution = HEIGHT_TO_RESOLUTION[height]
    if (!resolution) return undefined

    // Calculate GCD for simplest aspect ratio
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const divisor = gcd(width, height)

    return {
      resolution,
      aspectRatio: `${width / divisor}:${height / divisor}`,
    }
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
