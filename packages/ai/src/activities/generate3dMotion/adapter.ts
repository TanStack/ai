import type {
  Motion3dGenerationOptions,
  Motion3dGenerationResult,
  Motion3dJobResult,
  Motion3dStatusResult,
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
export interface Motion3dAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'motion3d'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * Default `modelOptions` for every call made with this adapter. `generate3dMotion()`
   * merges them under the call's `modelOptions`, one level deep: a key the
   * call sets replaces the default key in full.
   */
  readonly defaultModelOptions?: TProviderOptions | undefined

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
  }

  /** Submit a motion job. Returns the provider job id. */
  create3dMotionJob: (
    options: Motion3dGenerationOptions<TProviderOptions>,
  ) => Promise<Motion3dJobResult>

  /** Read the current status of a job. */
  get3dMotionStatus: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<Motion3dStatusResult>

  /** Fetch the finished assets. Call only after status is `completed`. */
  get3dMotion: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<Motion3dGenerationResult>

  /**
   * Optional. Ask the provider to stop a job. Implement it only when the
   * provider has a real cancel API. The core never calls it on its own:
   * aborting a stream stops local observation only.
   */
  cancel3dMotionJob?: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<void>
}

/**
 * A Motion3dAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyMotion3dAdapter = Motion3dAdapter<any, any>

/**
 * Abstract base class for motion adapters.
 *
 * @experimental Motion generation is an experimental feature and may change.
 */
export abstract class BaseMotion3dAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
> implements Motion3dAdapter<TModel, TProviderOptions> {
  readonly kind = 'motion3d' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  constructor(model: TModel) {
    this.model = model
  }

  abstract create3dMotionJob(
    options: Motion3dGenerationOptions<TProviderOptions>,
  ): Promise<Motion3dJobResult>

  abstract get3dMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Motion3dStatusResult>

  abstract get3dMotion(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Motion3dGenerationResult>
}
