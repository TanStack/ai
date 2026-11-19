import type {
  MotionGenerationOptions,
  MotionGenerationResult,
  MotionJobResult,
  MotionStatusResult,
} from '../../types'

/**
 * Motion adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`.
 * It makes skeletal animation assets (FBX, BVH, GLB, ...), not video.
 *
 * Provider jobs are long-running, so the contract is job-shaped: submit,
 * poll, fetch the finished assets. A provider that answers at once can return
 * a job whose first status is already `completed`.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export interface MotionAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'motion'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /** Submit a motion job. Returns the provider job id. */
  createMotionJob: (
    options: MotionGenerationOptions<TProviderOptions>,
  ) => Promise<MotionJobResult>

  /** Read the current status of a job. */
  getMotionStatus: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<MotionStatusResult>

  /** Fetch the finished assets. Call only after status is `completed`. */
  getMotion: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<MotionGenerationResult>

  /**
   * Optional. Ask the provider to stop a job. Implement it only when the
   * provider has a real cancel API. The core never calls it on its own:
   * aborting a stream stops local observation only.
   */
  cancelMotionJob?: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<void>
}

/**
 * A MotionAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyMotionAdapter = MotionAdapter<any, any>

/**
 * Abstract base class for motion adapters.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export abstract class BaseMotionAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements MotionAdapter<TModel, TProviderOptions> {
  readonly kind = 'motion' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  constructor(model: TModel) {
    this.model = model
  }

  abstract createMotionJob(
    options: MotionGenerationOptions<TProviderOptions>,
  ): Promise<MotionJobResult>

  abstract getMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionStatusResult>

  abstract getMotion(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionGenerationResult>
}
