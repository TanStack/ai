import type {
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../../types'

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
 */
export interface VideoAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
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
  }

  /**
   * Create a new video generation job.
   * Returns a job ID that can be used to poll for status and retrieve the video.
   */
  createVideoJob: (
    options: VideoGenerationOptions<TProviderOptions>,
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
}

/**
 * A VideoAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyVideoAdapter = VideoAdapter<any, any>

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
> implements VideoAdapter<TModel, TProviderOptions> {
  readonly kind = 'video' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
  }

  protected config: VideoAdapterConfig

  constructor(config: VideoAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract createVideoJob(
    options: VideoGenerationOptions<TProviderOptions>,
  ): Promise<VideoJobResult>

  abstract getVideoStatus(jobId: string): Promise<VideoStatusResult>

  abstract getVideoUrl(jobId: string): Promise<VideoUrlResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
