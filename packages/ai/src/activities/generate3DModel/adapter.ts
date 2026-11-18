import type {
  Model3DGenerationOptions,
  Model3DJobResult,
  Model3DResult,
  Model3DStatusResult,
  ModelInputModalitiesByName,
} from '../../types'

/**
 * Configuration for 3D model adapter instances.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export interface Model3DAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * 3D model adapter interface with pre-resolved generics.
 *
 * A provider function makes the adapter: `provider('model')` → `adapter`.
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generation is a job: `create3DModelJob` starts it, `get3DModelStatus` polls
 * it, and `get3DModel` reads the finished model.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'fal-ai/hunyuan3d-v3/image-to-3d')
 * - TProviderOptions: Provider-specific options (already resolved)
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelInputModalitiesByName: Map from model name to the non-text prompt
 *   modalities it accepts (constrains the `prompt` part types at compile time)
 *
 * @experimental 3D model generation is experimental and may change.
 */
export interface Model3DAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends ModelInputModalitiesByName =
    ModelInputModalitiesByName,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: '3dModel'
  /** Adapter name identifier */
  readonly name: string
  /**
   * Declares that this adapter can consume `{ type: 'file' }` content
   * sources (provider Files API references). The activity rejects file
   * sources before the request for adapters that do not declare this.
   */
  readonly supportsFileSources?: boolean
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  /**
   * Create a new 3D model generation job. Returns a job ID to poll the status
   * and to read the finished model.
   */
  create3DModelJob: (
    options: Model3DGenerationOptions<TProviderOptions>,
  ) => Promise<Model3DJobResult>

  /**
   * Get the current status of a 3D model generation job. Adapters should give
   * `options.abortSignal` to the provider request when supported.
   */
  get3DModelStatus: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<Model3DStatusResult>

  /**
   * Get the finished 3D model. Call it only after the status is 'completed'.
   * Adapters should give `options.abortSignal` to the provider request when
   * supported.
   */
  get3DModel: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<Model3DResult>

  /**
   * Optional. Ask the provider to stop a job that is not finished. Implement
   * it only when the provider has a real cancel API.
   */
  cancel3DModelJob?: (
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<void>
}

/**
 * A Model3DAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export type AnyModel3DAdapter = Model3DAdapter<any, any, any, any>

/**
 * Abstract base class for 3D model generation adapters.
 * Extend this class to implement a 3D model adapter for a specific provider.
 *
 * Generic parameters match Model3DAdapter - all pre-resolved by the provider function.
 *
 * @experimental 3D model generation is experimental and may change.
 */
export abstract class BaseModel3DAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelInputModalitiesByName extends ModelInputModalitiesByName =
    ModelInputModalitiesByName,
> implements Model3DAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelInputModalitiesByName
> {
  readonly kind = '3dModel' as const
  abstract readonly name: string
  readonly supportsFileSources: boolean = false
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  protected config: Model3DAdapterConfig

  constructor(config: Model3DAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract create3DModelJob(
    options: Model3DGenerationOptions<TProviderOptions>,
  ): Promise<Model3DJobResult>

  abstract get3DModelStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Model3DStatusResult>

  /** See {@link Model3DAdapter.get3DModel}. */
  abstract get3DModel(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<Model3DResult>

  protected generateId() {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
