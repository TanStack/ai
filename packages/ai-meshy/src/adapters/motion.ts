import { BaseMotionAdapter } from '@tanstack/ai/adapters'
import { cancelMeshyTask, createMeshyClient, mapMeshyStatus } from '../client'
import type { MotionGenerationOptions } from '@tanstack/ai'
import type { MeshyClient, MeshyClientConfig, MeshyTask } from '../client'

/**
 * The Meshy text to motion mode. `prime` gives a higher quality FBX clip.
 * `swift` is faster and cheaper, and gives a BVH clip.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export type MeshyMotionMode = 'prime' | 'swift'

const MOTION_PATH = '/v1/text-to-motion'

// Meshy sends empty strings and 0 in `result` until the task succeeds.
interface MeshyMotionTask extends MeshyTask {
  result?: {
    motion_url: string
    motion_format: string
    duration_ms: number
    mode: string
  }
}

/**
 * Meshy motion adapter. Runs Meshy text to motion tasks and returns the
 * motion clip URL. The clip is a raw skeletal animation, not attached to a
 * character.
 *
 * Meshy needs `duration`: 2 to 10 seconds, in steps of 0.5.
 *
 * `cancelMotionJob` cancels and refunds only a `PENDING` task. A running
 * task cannot be canceled. A finished task is kept, unless it finishes in
 * the short time between the status read and the cancel request.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export class MeshyMotionAdapter<
  TMode extends MeshyMotionMode,
> extends BaseMotionAdapter<TMode, Record<string, never>> {
  readonly name = 'meshy' as const
  private readonly client: MeshyClient

  constructor(mode: TMode, config?: MeshyClientConfig) {
    super(mode)
    this.client = createMeshyClient(config)
  }

  async createMotionJob(
    options: MotionGenerationOptions<Record<string, never>>,
  ) {
    const { logger, duration } = options
    if (duration === undefined) {
      throw new Error(
        'Meshy text to motion needs a duration: 2 to 10 seconds, in steps of 0.5.',
      )
    }
    logger.request(
      `activity=generateMotion provider=meshy model=${this.model}`,
      { provider: 'meshy', model: this.model },
    )
    try {
      const { result } = await this.client.post<{ result: string }>(
        MOTION_PATH,
        { prompt: options.prompt, mode: this.model, duration },
        options.abortSignal,
      )
      return { jobId: result, model: this.model }
    } catch (error) {
      logger.errors('meshy.createMotionJob fatal', {
        error,
        source: 'meshy.createMotionJob',
      })
      throw error
    }
  }

  private readTask(jobId: string, signal?: AbortSignal) {
    return this.client.get<MeshyMotionTask>(
      `${MOTION_PATH}/${encodeURIComponent(jobId)}`,
      { signal },
    )
  }

  async getMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    const task = await this.readTask(jobId, options?.abortSignal)
    return { jobId, ...mapMeshyStatus(task) }
  }

  async getMotion(jobId: string, options?: { abortSignal?: AbortSignal }) {
    const task = await this.readTask(jobId, options?.abortSignal)
    if (task.status !== 'SUCCEEDED') {
      const { error } = mapMeshyStatus(task)
      throw new Error(
        error ?? `Meshy task ${jobId} is not finished (status ${task.status})`,
      )
    }
    const result = task.result
    if (!result?.motion_url) {
      throw new Error(`Meshy task ${jobId} succeeded but has no motion_url`)
    }
    const format = result.motion_format
    return {
      jobId,
      model: this.model,
      assets: [
        {
          url: result.motion_url,
          format,
          fileName: `meshy-${jobId}.${format}`,
        },
      ],
    }
  }

  /**
   * Cancels the Meshy task with `cancelMeshyTask`: a `PENDING` task is
   * canceled and refunded, and a finished task is kept. A task that finishes
   * between the read and the `DELETE` is still deleted.
   *
   * @throws {Error} When the task is already running.
   * @throws {MeshyApiError} For any other response that is not 2xx.
   */
  async cancelMotionJob(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) {
    await cancelMeshyTask(
      this.client,
      `${MOTION_PATH}/${encodeURIComponent(jobId)}`,
      jobId,
      options?.abortSignal,
    )
  }
}

/**
 * Creates a Meshy motion adapter for `generateMotion()`. Reads
 * `config.apiKey`, or `MESHY_API_KEY` from the environment.
 *
 * @param mode - `'prime'` (FBX clip) or `'swift'` (BVH clip).
 * @param config - The API key, base URL, extra headers, and `fetch`.
 *
 * @example
 * ```ts
 * const job = await generateMotion({
 *   adapter: meshyMotion('prime'),
 *   prompt: 'a person jumps over a fence',
 *   duration: 4,
 *   threadId,
 * })
 * ```
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export function meshyMotion<TMode extends MeshyMotionMode>(
  mode: TMode,
  config?: MeshyClientConfig,
) {
  return new MeshyMotionAdapter(mode, config)
}
