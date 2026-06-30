import type {
  ModelInputModalitiesByName,
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../../types'

/**
 * Structured description of the durations a video model accepts.
 *
 * Tagged union so the same shape can express discrete enums (OpenAI Sora,
 * Veo), continuous ranges, mixed shapes, and models with no duration field.
 * Consumed by `VideoAdapter.availableDurations()`.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type DurationOptions<T extends string | number | undefined> =
  | { kind: 'discrete'; values: ReadonlyArray<NonNullable<T>> }
  | { kind: 'range'; min: number; max: number; step?: number; unit: 'seconds' }
  | {
      kind: 'mixed'
      values: ReadonlyArray<NonNullable<T>>
      range?: { min: number; max: number; step?: number }
    }
  | { kind: 'none' }

/**
 * Configuration for video adapter instances
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface VideoAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Video adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'sora-2')
 * - TProviderOptions: Provider-specific options (already resolved)
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelSizeByName: Map from model name to its supported sizes
 * - TModelInputModalitiesByName: Map from model name to the non-text prompt
 *   modalities it accepts (constrains the `prompt` part types at compile time)
 * - TModelDurationByName: Map from model name to its supported duration
 *   union. Defaults to `Record<string, number>` so adapters that haven't
 *   declared a map keep today's `duration?: number` typing.
 */
export interface VideoAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string | undefined> = Record<
    string,
    string
  >,
  TModelInputModalitiesByName extends ModelInputModalitiesByName =
    ModelInputModalitiesByName,
  TModelDurationByName extends Record<string, string | number | undefined> =
    Record<string, number>,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'video'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
    modelInputModalitiesByName: TModelInputModalitiesByName
    modelDurationByName: TModelDurationByName
  }

  /**
   * Create a new video generation job.
   * Returns a job ID that can be used to poll for status and retrieve the video.
   */
  createVideoJob: (
    options: VideoGenerationOptions<
      TProviderOptions,
      TModelSizeByName[TModel],
      TModelDurationByName[TModel]
    >,
  ) => Promise<VideoJobResult>

  /**
   * Get the current status of a video generation job.
   */
  getVideoStatus: (jobId: string) => Promise<VideoStatusResult>

  /**
   * Get the URL to download/view the generated video.
   * Should only be called after status is 'completed'.
   */
  getVideoUrl: (jobId: string) => Promise<VideoUrlResult>

  /**
   * Describe the durations this adapter's model accepts. Returns a tagged
   * union so consumers can render UI / coerce input without provider-specific
   * knowledge.
   */
  availableDurations: () => DurationOptions<TModelDurationByName[TModel]>

  /**
   * Coerce a raw seconds value to the closest valid duration for this model.
   * Returns `undefined` for models with no duration field.
   */
  snapDuration: (seconds: number) => TModelDurationByName[TModel] | undefined
}

/**
 * A VideoAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyVideoAdapter = VideoAdapter<any, any, any, any, any, any>

/**
 * Abstract base class for video generation adapters.
 * Extend this class to implement a video adapter for a specific provider.
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * Generic parameters match VideoAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseVideoAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string | undefined> = Record<
    string,
    string
  >,
  TModelInputModalitiesByName extends ModelInputModalitiesByName =
    ModelInputModalitiesByName,
  TModelDurationByName extends Record<string, string | number | undefined> =
    Record<string, number>,
> implements VideoAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName,
  TModelInputModalitiesByName,
  TModelDurationByName
> {
  readonly kind = 'video' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
    modelInputModalitiesByName: TModelInputModalitiesByName
    modelDurationByName: TModelDurationByName
  }

  protected config: VideoAdapterConfig

  constructor(config: VideoAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract createVideoJob(
    options: VideoGenerationOptions<
      TProviderOptions,
      TModelSizeByName[TModel],
      TModelDurationByName[TModel]
    >,
  ): Promise<VideoJobResult>

  abstract getVideoStatus(jobId: string): Promise<VideoStatusResult>

  abstract getVideoUrl(jobId: string): Promise<VideoUrlResult>

  /**
   * Default implementation returns `{ kind: 'none' }`. Adapters that have
   * declared their per-model duration map should override this.
   */
  availableDurations(): DurationOptions<TModelDurationByName[TModel]> {
    return { kind: 'none' }
  }

  /**
   * Default implementation returns `undefined`. Adapters that have declared
   * their per-model duration map should override.
   */
  snapDuration(_seconds: number): TModelDurationByName[TModel] | undefined {
    return undefined
  }

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
