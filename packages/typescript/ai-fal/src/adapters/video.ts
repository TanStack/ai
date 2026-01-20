import { fal } from '@fal-ai/client'
import { BaseVideoAdapter } from '@tanstack/ai/adapters'
import {
  configureFalClient,
  getFalApiKeyFromEnv,
  generateId as utilGenerateId,
} from '../utils'
import type { FalClientConfig } from '../utils'
import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '@tanstack/ai'
import type { FalModel, FalVideoProviderOptions } from '../model-meta'

export interface FalVideoConfig extends Omit<FalClientConfig, 'apiKey'> {
  apiKey?: string
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
export class FalVideoAdapter<
  TModel extends FalModel,
> extends BaseVideoAdapter<TModel, FalVideoProviderOptions<TModel>> {
  readonly kind = 'video' as const
  readonly name = 'fal' as const

  constructor(apiKey: string, model: TModel, config?: FalVideoConfig) {
    super({}, model)
    configureFalClient({ apiKey, proxyUrl: config?.proxyUrl })
  }

  async createVideoJob(
    options: VideoGenerationOptions<FalVideoProviderOptions<TModel>>,
  ): Promise<VideoJobResult> {
    const { model, prompt, size, duration, modelOptions } = options

    // Build the input object for fal.ai
    const input: Record<string, unknown> = {
      prompt,
    }

    // Add duration if specified
    if (duration) {
      input.duration = duration
    }

    // Parse size to aspect ratio if provided
    if (size) {
      const aspectRatio = this.sizeToAspectRatio(size)
      if (aspectRatio) {
        input.aspect_ratio = aspectRatio
      }
    }

    // Merge model-specific options
    if (modelOptions) {
      Object.assign(input, modelOptions)
    }

    // Submit to queue and get request ID
    const { request_id } = await fal.queue.submit(model, {
      input,
    })

    return {
      jobId: request_id,
      model,
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
      progress: statusResponse.queue_position
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
   * Convert WIDTHxHEIGHT size format to aspect ratio.
   */
  private sizeToAspectRatio(size: string): string | undefined {
    const match = size.match(/^(\d+)x(\d+)$/)
    if (!match || !match[1] || !match[2]) return undefined

    const width = parseInt(match[1], 10)
    const height = parseInt(match[2], 10)

    // Calculate GCD for simplest ratio
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const divisor = gcd(width, height)

    return `${width / divisor}:${height / divisor}`
  }
}

/**
 * Create a fal.ai video adapter with an explicit API key.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function createFalVideo<TModel extends FalModel>(
  model: TModel,
  apiKey: string,
  config?: FalVideoConfig,
): FalVideoAdapter<TModel> {
  return new FalVideoAdapter(apiKey, model, config)
}

/**
 * Create a fal.ai video adapter using the FAL_KEY environment variable.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function falVideo<TModel extends FalModel>(
  model: TModel,
  config?: FalVideoConfig,
): FalVideoAdapter<TModel> {
  const apiKey = getFalApiKeyFromEnv()
  return createFalVideo(model, apiKey, config)
}
