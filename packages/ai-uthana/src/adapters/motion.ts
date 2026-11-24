import { BaseMotion3dAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { resolveUthanaConfig, uthanaGraphql } from '../client'
import type {
  Motion3dAsset,
  Motion3dGenerationOptions,
  Motion3dGenerationResult,
  Motion3dJobResult,
  Motion3dStatusResult,
} from '@tanstack/ai'
import type { ResolvedUthanaConfig, UthanaClientConfig } from '../client'

/**
 * Uthana text-to-motion models that run as jobs. Any other model id is
 * passed through as a string.
 */
export type UthanaMotion3dModel =
  | 'text-to-motion-3.0'
  | 'text-to-motion-3.0-lite'
  | 'text-to-motion-3.0-mini'
  | (string & {})

/** File formats the Uthana download endpoint serves. */
export type UthanaMotion3dFormat = 'fbx' | 'glb'

/** Uthana's built-in character "Tar", used when no `character_id` is set. */
export const UTHANA_DEFAULT_CHARACTER_ID = 'cXi2eAP19XwQ'

export interface UthanaMotion3dProviderOptions {
  /**
   * Character to generate for and download on. Use an id from
   * `createUthanaCharacter()` to get the motion on your own rig, or a
   * built-in character id. Defaults to Uthana's "Tar".
   */
  character_id?: string
  /** Files to download for each motion. Default `['fbx']`. */
  formats?: Array<UthanaMotion3dFormat>
  /** Frame rate of the downloaded files. */
  fps?: 24 | 30 | 60
  /** Uthana's faster mode. Default false. */
  fast?: boolean
  /** Let Uthana rewrite the prompt before generation. Default true. */
  rewrite_prompt?: boolean
}

/** Configuration for the Uthana motion adapter. */
export interface UthanaMotion3dConfig extends UthanaClientConfig {
  /** Provider options for every job. The call's `modelOptions` win. */
  defaults?: UthanaMotion3dProviderOptions
  /**
   * Default `modelOptions` for every call. The activity merges them under
   * the call's `modelOptions`. A key the call sets replaces the default key
   * in full.
   */
  defaultModelOptions?: UthanaMotion3dProviderOptions
}

interface UthanaJob {
  id: string
  status: string
  result?: {
    exc?: string | null
    result?: { id?: string } | null
  } | null
}

const CONTENT_TYPES: Record<UthanaMotion3dFormat, string> = {
  fbx: 'application/fbx',
  glb: 'model/gltf-binary',
}

function jobError(job: UthanaJob): string | undefined {
  return job.result?.exc ?? undefined
}

function isFormat(value: string): value is UthanaMotion3dFormat {
  return value === 'fbx' || value === 'glb'
}

/**
 * The job id carries the download options after a `?`, so a poll from any
 * process or adapter downloads on the same character, formats, and fps.
 */
function encodeJobId(id: string, options: UthanaMotion3dProviderOptions) {
  const params = new URLSearchParams()
  if (options.character_id) params.set('character', options.character_id)
  for (const format of options.formats ?? []) params.append('formats', format)
  if (options.fps !== undefined) params.set('fps', String(options.fps))
  const query = params.toString()
  return query ? `${id}?${query}` : id
}

function decodeJobId(jobId: string): {
  id: string
  options: UthanaMotion3dProviderOptions
} {
  const index = jobId.indexOf('?')
  if (index === -1) return { id: jobId, options: {} }
  const params = new URLSearchParams(jobId.slice(index + 1))
  const character = params.get('character')
  const formats = params.getAll('formats').filter(isFormat)
  const fps = Number(params.get('fps'))
  return {
    id: jobId.slice(0, index),
    options: {
      ...(character ? { character_id: character } : {}),
      ...(formats.length > 0 ? { formats } : {}),
      ...(fps === 24 || fps === 30 || fps === 60 ? { fps } : {}),
    },
  }
}

/**
 * Uthana motion adapter. Runs Uthana text-to-motion jobs and downloads the
 * finished motion as FBX or GLB on the chosen character.
 *
 * Uthana serves files only with your API key, so the adapter downloads them
 * and returns each asset as a `data:` URL. Uthana has no cancel API, so this
 * adapter has no `cancel3dMotionJob`.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export class UthanaMotion3dAdapter<
  TModel extends UthanaMotion3dModel,
> extends BaseMotion3dAdapter<TModel, UthanaMotion3dProviderOptions> {
  readonly name = 'uthana' as const
  private readonly config: ResolvedUthanaConfig
  private readonly defaults: UthanaMotion3dProviderOptions
  readonly defaultModelOptions: UthanaMotion3dProviderOptions | undefined

  constructor(model: TModel, config: UthanaMotion3dConfig = {}) {
    super(model)
    const { defaults, defaultModelOptions, ...clientConfig } = config
    this.config = resolveUthanaConfig(clientConfig)
    this.defaults = defaults ?? {}
    this.defaultModelOptions = defaultModelOptions
  }

  async create3dMotionJob(
    options: Motion3dGenerationOptions<UthanaMotion3dProviderOptions>,
  ): Promise<Motion3dJobResult> {
    const { logger } = options
    const modelOptions = { ...this.defaults, ...options.modelOptions }
    logger.request(
      `activity=generate3dMotion provider=uthana model=${this.model}`,
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
      const jobId = encodeJobId(
        data.create_text_to_motion_job.job.id,
        modelOptions,
      )
      return { jobId, model: this.model }
    } catch (error) {
      logger.errors('uthana.create3dMotionJob fatal', {
        error,
        source: 'uthana.create3dMotionJob',
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

  async get3dMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Motion3dStatusResult> {
    const job = await this.readJob(decodeJobId(jobId).id, options?.abortSignal)
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

  async get3dMotion(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Motion3dGenerationResult> {
    const { id, options: jobOptions } = decodeJobId(jobId)
    const job = await this.readJob(id, options?.abortSignal)
    const motionId = job.result?.result?.id
    if (job.status !== 'FINISHED' || !motionId) {
      throw new Error(
        `Uthana job ${jobId} has no motion (status ${job.status}${jobError(job) ? `: ${jobError(job)}` : ''})`,
      )
    }
    const characterId = jobOptions.character_id ?? UTHANA_DEFAULT_CHARACTER_ID
    const assets: Array<Motion3dAsset> = []
    for (const format of jobOptions.formats ?? ['fbx']) {
      const fileName = `uthana-${motionId}.${format}`
      const query = jobOptions.fps !== undefined ? `?fps=${jobOptions.fps}` : ''
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
    return { jobId, model: this.model, assets }
  }
}

/**
 * Create an Uthana motion adapter. Reads `config.apiKey`, or
 * `UTHANA_API_KEY` from the environment. `config.defaults` sets provider
 * options for every job.
 *
 * @example
 * ```ts
 * const adapter = uthana3dMotion('text-to-motion-3.0')
 * ```
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export function uthana3dMotion<TModel extends UthanaMotion3dModel>(
  model: TModel,
  config?: UthanaMotion3dConfig,
): UthanaMotion3dAdapter<TModel> {
  return new UthanaMotion3dAdapter(model, config)
}
