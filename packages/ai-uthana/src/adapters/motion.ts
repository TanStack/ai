import { BaseMotionAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { resolveUthanaConfig, uthanaGraphql } from '../client'
import type {
  MotionAsset,
  MotionGenerationOptions,
  MotionGenerationResult,
  MotionJobResult,
  MotionStatusResult,
} from '@tanstack/ai'
import type { ResolvedUthanaConfig, UthanaClientConfig } from '../client'

/**
 * Uthana text-to-motion models that run as jobs. Any other model id is
 * passed through as a string.
 */
export type UthanaMotionModel =
  | 'text-to-motion-3.0'
  | 'text-to-motion-3.0-lite'
  | 'text-to-motion-3.0-mini'
  | (string & {})

/** File formats the Uthana download endpoint serves. */
export type UthanaMotionFormat = 'fbx' | 'glb'

/** Uthana's built-in character "Tar", used when no `character_id` is set. */
export const UTHANA_DEFAULT_CHARACTER_ID = 'cXi2eAP19XwQ'

export interface UthanaMotionProviderOptions {
  /**
   * Character to generate for and download on. Use an id from
   * `createUthanaCharacter()` to get the motion on your own rig, or a
   * built-in character id. Defaults to Uthana's "Tar".
   */
  character_id?: string
  /** Files to download for each motion. Default `['fbx']`. */
  formats?: Array<UthanaMotionFormat>
  /** Frame rate of the downloaded files. */
  fps?: 24 | 30 | 60
  /** Uthana's faster mode. Default false. */
  fast?: boolean
  /** Let Uthana rewrite the prompt before generation. Default true. */
  rewrite_prompt?: boolean
}

interface UthanaJob {
  id: string
  status: string
  result?: {
    exc?: string | null
    result?: { id?: string } | null
  } | null
}

const CONTENT_TYPES: Record<UthanaMotionFormat, string> = {
  fbx: 'application/fbx',
  glb: 'model/gltf-binary',
}

function jobError(job: UthanaJob): string | undefined {
  return job.result?.exc ?? undefined
}

/**
 * Uthana motion adapter. Runs Uthana text-to-motion jobs and downloads the
 * finished motion as FBX or GLB on the chosen character.
 *
 * Uthana serves files only with your API key, so the adapter downloads them
 * and returns each asset as a `data:` URL. Uthana has no cancel API, so this
 * adapter has no `cancelMotionJob`.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export class UthanaMotionAdapter<
  TModel extends UthanaMotionModel,
> extends BaseMotionAdapter<TModel, UthanaMotionProviderOptions> {
  readonly name = 'uthana' as const
  private readonly config: ResolvedUthanaConfig
  // ponytail: options of the last submit per job, so getMotion downloads on
  // the same character and formats. A poll from another process uses the
  // adapter's own defaults instead.
  private readonly downloadOptions = new Map<
    string,
    UthanaMotionProviderOptions
  >()
  private readonly defaults: UthanaMotionProviderOptions

  constructor(
    model: TModel,
    config?: UthanaClientConfig & { defaults?: UthanaMotionProviderOptions },
  ) {
    super(model)
    this.config = resolveUthanaConfig(config)
    this.defaults = config?.defaults ?? {}
  }

  async createMotionJob(
    options: MotionGenerationOptions<UthanaMotionProviderOptions>,
  ): Promise<MotionJobResult> {
    const { logger } = options
    const modelOptions = { ...this.defaults, ...options.modelOptions }
    logger.request(
      `activity=generateMotion provider=uthana model=${this.model}`,
      { provider: 'uthana', model: this.model },
    )
    try {
      const data = await uthanaGraphql<{
        create_text_to_motion_job: { job: UthanaJob }
      }>(
        this.config,
        `mutation($prompt: String!, $model: String!, $length: Float, $character_id: String, $fast: Boolean, $rewrite_prompt: Boolean) {
          create_text_to_motion_job(prompt: $prompt, model: $model, length: $length, character_id: $character_id, fast: $fast, rewrite_prompt: $rewrite_prompt) { job { id status } }
        }`,
        {
          prompt: options.prompt,
          model: this.model,
          length: options.duration,
          character_id: modelOptions.character_id,
          fast: modelOptions.fast,
          rewrite_prompt: modelOptions.rewrite_prompt,
        },
        options.abortSignal,
      )
      const jobId = data.create_text_to_motion_job.job.id
      this.downloadOptions.set(jobId, modelOptions)
      return { jobId, model: this.model }
    } catch (error) {
      logger.errors('uthana.createMotionJob fatal', {
        error,
        source: 'uthana.createMotionJob',
      })
      throw error
    }
  }

  private async readJob(jobId: string, abortSignal?: AbortSignal) {
    const data = await uthanaGraphql<{ job: UthanaJob | null }>(
      this.config,
      `query($id: String) { job(job_id: $id) { id status result } }`,
      { id: jobId },
      abortSignal,
    )
    if (!data.job) throw new Error(`Uthana job ${jobId} not found`)
    return data.job
  }

  async getMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionStatusResult> {
    const job = await this.readJob(jobId, options?.abortSignal)
    const error = jobError(job)
    switch (job.status) {
      case 'READY':
        return { jobId, status: 'pending' }
      case 'FINISHED':
        return error
          ? { jobId, status: 'failed', error }
          : { jobId, status: 'completed' }
      case 'FAILED':
        return { jobId, status: 'failed', error: error ?? 'Uthana job failed' }
      default:
        // RESERVED (a worker took the job) and any other running state.
        return { jobId, status: 'processing' }
    }
  }

  async getMotion(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionGenerationResult> {
    const job = await this.readJob(jobId, options?.abortSignal)
    const motionId = job.result?.result?.id
    if (job.status !== 'FINISHED' || !motionId) {
      throw new Error(
        `Uthana job ${jobId} has no motion (status ${job.status}${jobError(job) ? `: ${jobError(job)}` : ''})`,
      )
    }
    const opts = { ...this.defaults, ...this.downloadOptions.get(jobId) }
    const characterId = opts.character_id ?? UTHANA_DEFAULT_CHARACTER_ID
    const assets: Array<MotionAsset> = []
    for (const format of opts.formats ?? ['fbx']) {
      const fileName = `uthana-${motionId}.${format}`
      const query = opts.fps !== undefined ? `?fps=${opts.fps}` : ''
      const url = `${this.config.baseUrl}/motion/file/motion_viewer/${encodeURIComponent(characterId)}/${encodeURIComponent(motionId)}/${format}/${fileName}${query}`
      const response = await this.config.fetch(url, {
        headers: { authorization: this.config.authorization },
        ...(options?.abortSignal ? { signal: options.abortSignal } : {}),
      })
      if (!response.ok) {
        throw new Error(
          `Uthana download of ${format} failed (${response.status} ${response.statusText})`,
        )
      }
      const bytes = await response.arrayBuffer()
      const contentType = CONTENT_TYPES[format]
      assets.push({
        url: `data:${contentType};base64,${arrayBufferToBase64(bytes)}`,
        format,
        contentType,
        fileName,
        fileSize: bytes.byteLength,
      })
    }
    this.downloadOptions.delete(jobId)
    return { jobId, model: this.model, assets }
  }
}

/**
 * Create an Uthana motion adapter. Reads `config.apiKey`, or
 * `UTHANA_API_KEY` from the environment. `config.defaults` sets provider
 * options for every job, which also covers polls from another process.
 *
 * @example
 * ```ts
 * const adapter = uthanaMotion('text-to-motion-3.0')
 * ```
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export function uthanaMotion<TModel extends UthanaMotionModel>(
  model: TModel,
  config?: UthanaClientConfig & { defaults?: UthanaMotionProviderOptions },
): UthanaMotionAdapter<TModel> {
  return new UthanaMotionAdapter(model, config)
}
