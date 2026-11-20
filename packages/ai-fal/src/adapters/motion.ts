import { BaseMotionAdapter } from '@tanstack/ai/adapters'
import {
  createAdapterFalClient,
  extractUrlExtension,
  falValidationMessage,
} from '../utils/client'
import { buildFalUsage, takeBillableUnits } from '../utils/billing'
import type {
  MotionAsset,
  MotionGenerationOptions,
  MotionGenerationResult,
  MotionJobResult,
  MotionStatusResult,
} from '@tanstack/ai'
import type { FalModelInput } from '../model-meta'
import type { FalClientConfig } from '../utils/client'
import type { FalClient } from '../client/index'

/**
 * fal motion models. Both Hunyuan Motion endpoints return an FBX file and
 * take the same input. Any other fal endpoint id is accepted as a string.
 */
export type FalMotionModel =
  | 'fal-ai/hunyuan-motion'
  | 'fal-ai/hunyuan-motion/fast'
  | (string & {})

/**
 * Hunyuan Motion options: `seed`, `guidance_scale` (1 to 10, default 5), and
 * `output_format` (`'fbx'` default, or `'dict'` for raw JSON). `prompt` and
 * `duration` are top-level `generateMotion()` options.
 */
export type FalHunyuanMotionProviderOptions = Omit<
  FalModelInput<'fal-ai/hunyuan-motion'>,
  'prompt' | 'duration'
>

/** Provider options for a fal motion model. */
export type FalMotionProviderOptions<TModel extends string> = TModel extends
  | 'fal-ai/hunyuan-motion'
  | 'fal-ai/hunyuan-motion/fast'
  ? FalHunyuanMotionProviderOptions
  : Record<string, unknown>

interface FalQueueStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  queue_position?: number
  /** Set on a COMPLETED request that failed */
  error?: string
}

interface FalFile {
  url: string
  content_type?: string
  file_name?: string
  file_size?: number
}

function isFalFile(value: unknown): value is FalFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof value.url === 'string'
  )
}

/**
 * Every file in a fal motion output becomes an asset. The format comes from
 * the file name or URL extension, then from the field name
 * (`fbx_file` → `fbx`, `motion_json` → `json`).
 */
function toMotionAssets(output: Record<string, unknown>): Array<MotionAsset> {
  const assets: Array<MotionAsset> = []
  for (const [field, value] of Object.entries(output)) {
    if (!isFalFile(value)) continue
    const extension = extractUrlExtension(value.file_name ?? value.url)
    const format =
      extension?.toLowerCase() ??
      (field === 'motion_json' ? 'json' : field.replace(/_file$/, ''))
    assets.push({
      url: value.url,
      format,
      ...(value.content_type ? { contentType: value.content_type } : {}),
      ...(value.file_name ? { fileName: value.file_name } : {}),
      ...(value.file_size !== undefined ? { fileSize: value.file_size } : {}),
    })
  }
  return assets
}

/**
 * fal motion adapter. Runs text-to-motion models on the fal queue and
 * returns the skeletal animation files they produce.
 *
 * fal file URLs follow the account's media expiry setting, so copy files
 * you want to keep.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export class FalMotionAdapter<
  TModel extends FalMotionModel,
> extends BaseMotionAdapter<TModel, FalMotionProviderOptions<TModel>> {
  readonly name = 'fal' as const
  private readonly client: FalClient

  constructor(model: TModel, config?: FalClientConfig) {
    super(model)
    this.client = createAdapterFalClient(config)
  }

  async createMotionJob(
    options: MotionGenerationOptions<FalMotionProviderOptions<TModel>>,
  ): Promise<MotionJobResult> {
    const { logger } = options
    logger.request(`activity=generateMotion provider=fal model=${this.model}`, {
      provider: 'fal',
      model: this.model,
    })
    try {
      const { request_id } = await this.client.queue.submit(this.model, {
        // The fal SDK keys input types by endpoint id; a generic TModel
        // cannot narrow to one, so the built input is cast like falVideo does.
        input: {
          ...options.modelOptions,
          prompt: options.prompt,
          ...(options.duration !== undefined
            ? { duration: options.duration }
            : {}),
        } as FalModelInput<TModel>,
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
      return { jobId: request_id, model: this.model }
    } catch (error) {
      logger.errors('fal.createMotionJob fatal', {
        error,
        source: 'fal.createMotionJob',
      })
      throw error
    }
  }

  async getMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionStatusResult> {
    const response = (await this.client.queue.status(this.model, {
      requestId: jobId,
      logs: false,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    })) as FalQueueStatusResponse

    switch (response.status) {
      case 'IN_QUEUE':
        return {
          jobId,
          status: 'pending',
          ...(response.queue_position != null
            ? { queuePosition: response.queue_position }
            : {}),
        }
      case 'IN_PROGRESS':
        return { jobId, status: 'processing' }
      case 'COMPLETED':
        return response.error
          ? { jobId, status: 'failed', error: response.error }
          : { jobId, status: 'completed' }
    }
  }

  async getMotion(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionGenerationResult> {
    let result
    try {
      result = await this.client.queue.result(this.model, {
        requestId: jobId,
        ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
    } catch (error) {
      if (options?.abortSignal?.aborted) throw error
      const validation = falValidationMessage(error)
      if (validation) {
        throw new Error(`Motion generation failed: ${validation}`)
      }
      throw error
    }

    const output = (result.data ?? {}) as Record<string, unknown>
    const assets = toMotionAssets(output)
    if (assets.length === 0) {
      throw new Error(`fal returned no motion files for request ${jobId}`)
    }
    const usage = buildFalUsage(takeBillableUnits(result.requestId))
    return {
      jobId,
      model: this.model,
      assets,
      ...(typeof output.seed === 'number' ? { seed: output.seed } : {}),
      ...(usage ? { usage } : {}),
    }
  }

  /**
   * Uses the fal queue cancel endpoint. fal removes a queued request. A
   * request that already runs gets a cancel request and may still finish.
   * fal rejects a cancel for a request that already completed.
   */
  async cancelMotionJob(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<void> {
    await this.client.queue.cancel(this.model, {
      requestId: jobId,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    })
  }
}

/**
 * Create a fal motion adapter. Reads `config.apiKey`, or `FAL_KEY` from the
 * environment.
 *
 * @example
 * ```ts
 * const adapter = falMotion('fal-ai/hunyuan-motion')
 * ```
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export function falMotion<TModel extends FalMotionModel>(
  model: TModel,
  config?: FalClientConfig,
): FalMotionAdapter<TModel> {
  return new FalMotionAdapter(model, config)
}
