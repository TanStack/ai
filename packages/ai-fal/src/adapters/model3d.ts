import { BaseModel3dAdapter } from '@tanstack/ai/adapters'
import {
  createAdapterFalClient,
  generateId as utilGenerateId,
} from '../utils/client'
import { buildFalUsage, takeBillableUnits } from '../utils/billing'
import { ApiError, ValidationError } from '../client/index'
import { mapModel3dPromptToFalFields } from '../model3d/model3d-inputs'
import { mapFalModel3dOutput } from '../model3d/model3d-output'
import type { Model3dGenerationOptions } from '@tanstack/ai'
import type {
  Fal3dModel,
  Fal3dModelProviderOptions,
  Fal3dPromptModalitiesFor,
} from '../model-meta'
import type { FalClientConfig } from '../utils/client'
import type { FalClient } from '../client/index'

/**
 * Read the message of a failed fal request. fal puts the reason in
 * `body.detail`: a string, or a list of field errors for a 422.
 */
function falErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const body: unknown = error.body
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body
        ? body.detail
        : undefined
    if (typeof detail === 'string') return detail
    if (error instanceof ValidationError && error.fieldErrors.length > 0) {
      return error.fieldErrors
        .map(({ loc, msg }) =>
          loc.length > 0 ? `${loc.join('.')}: ${msg}` : msg,
        )
        .join('; ')
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * fal 3D model adapter. It runs any fal 3D endpoint (Hunyuan3D, TRELLIS,
 * Rodin, Tripo, Meshy, SAM-3 3D, and others) as a queue job.
 *
 * The prompt text, image parts, and `model3d` parts go to the endpoint input
 * fields. `modelOptions` is typed from the endpoint input, without those
 * fields. The result has the best GLB in `url`, and every mesh file and
 * texture file in `files`.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export class Fal3dModelAdapter<
  TModel extends Fal3dModel,
> extends BaseModel3dAdapter<
  TModel,
  Fal3dModelProviderOptions<TModel>,
  Record<TModel, Fal3dModelProviderOptions<TModel>>,
  Record<TModel, Fal3dPromptModalitiesFor<TModel>>
> {
  readonly name = 'fal' as const
  // Consumes fal storage URLs uploaded via falFiles().
  override readonly supportsFileSources = true
  private readonly client: FalClient

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    this.client = createAdapterFalClient(config)
  }

  async create3dModelJob(
    options: Model3dGenerationOptions<Fal3dModelProviderOptions<TModel>>,
  ) {
    const { modelOptions, logger } = options

    logger.request(
      `activity=generate3dModel provider=fal model=${this.model}`,
      { provider: 'fal', model: this.model },
    )

    try {
      // A plain string id, so the fal client takes any input object.
      const endpoint: string = this.model
      const promptFields = mapModel3dPromptToFalFields(
        this.model,
        options.prompt,
      )
      // Submit to the queue. Pass the abortSignal per request, not in the
      // client config, so it cannot cancel other jobs.
      const { request_id } = await this.client.queue.submit(endpoint, {
        input: { ...modelOptions, ...promptFields },
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
      return { jobId: request_id, model: this.model }
    } catch (error) {
      logger.errors('fal.create3dModelJob fatal', {
        error,
        source: 'fal.create3dModelJob',
      })
      throw error
    }
  }

  /**
   * Reads the queue status. fal has no failed queue status: a failed job is
   * `COMPLETED` with an `error` message, and this maps it to `failed`.
   */
  async get3dModelStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    const endpoint: string = this.model
    const falStatus = await this.client.queue.status(endpoint, {
      requestId: jobId,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    })
    switch (falStatus.status) {
      case 'IN_QUEUE':
        return { jobId, status: 'pending' as const }
      case 'IN_PROGRESS':
        return { jobId, status: 'processing' as const }
      case 'COMPLETED': {
        const error =
          'error' in falStatus && typeof falStatus.error === 'string'
            ? falStatus.error
            : undefined
        return error
          ? { jobId, status: 'failed' as const, error }
          : { jobId, status: 'completed' as const }
      }
      default: {
        const unhandled: never = falStatus
        throw new Error(
          `fal: unknown queue status ${JSON.stringify(unhandled)}`,
        )
      }
    }
  }

  /**
   * Reads the finished job and maps it to one `Model3dResult`. A failed job
   * throws an `Error` with the message from fal.
   */
  async get3dModel(jobId: string, options?: { abortSignal?: AbortSignal }) {
    const endpoint: string = this.model
    let result
    try {
      result = await this.client.queue.result(endpoint, {
        requestId: jobId,
        ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
      })
    } catch (error: unknown) {
      // A cancelled call is not a provider failure: keep the abort error.
      if (options?.abortSignal?.aborted) throw error
      throw new Error(
        `fal: 3D model job ${jobId} on ${this.model} failed: ${falErrorMessage(error)}`,
      )
    }

    const usage = buildFalUsage(takeBillableUnits(result.requestId))
    return {
      ...mapFalModel3dOutput(jobId, result.data),
      ...(usage ? { usage } : {}),
    }
  }

  /**
   * Cancels a queued job with the fal queue cancel endpoint. fal can refuse
   * when the job already runs, and then this rejects.
   */
  async cancel3dModelJob(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    const endpoint: string = this.model
    await this.client.queue.cancel(endpoint, {
      requestId: jobId,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    })
  }

  protected override generateId() {
    return utilGenerateId(this.name)
  }
}

/**
 * Create a fal 3D model adapter. It reads the API key from `config.apiKey`,
 * or from the `FAL_KEY` environment variable.
 *
 * @param model - A fal 3D endpoint id, for example
 *   `'fal-ai/hunyuan3d-v3/image-to-3d'`. Known ids autocomplete and type
 *   `modelOptions`. Other ids work untyped.
 * @param config - Optional fal client config (API key, proxy URL, fetch).
 *
 * @example
 * ```ts
 * import { generate3dModel } from '@tanstack/ai'
 * import { fal3dModel } from '@tanstack/ai-fal'
 *
 * const { url, format } = await generate3dModel({
 *   adapter: fal3dModel('fal-ai/hunyuan3d-v3/image-to-3d'),
 *   threadId: 'thread-1',
 *   prompt: [
 *     { type: 'image', source: { type: 'url', value: 'https://example.com/chair.png' } },
 *   ],
 *   modelOptions: { face_count: 50000 },
 *   wait: true,
 * })
 * ```
 *
 * @experimental 3D model generation is experimental and may change.
 */
export function fal3dModel<TModel extends Fal3dModel>(
  model: TModel,
  config?: FalClientConfig,
) {
  return new Fal3dModelAdapter(model, config)
}
