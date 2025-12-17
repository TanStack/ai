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
 * Base interface for video generation adapters.
 * Provides type-safe video generation functionality with support for
 * job-based async operations (create, poll status, get URL).
 *
 * @experimental Video generation is an experimental feature and may change.
 *
 * Generic parameters:
 * - TModels: Array of supported video model names
 * - TProviderOptions: Base provider-specific options for video generation
 * - TSelectedModel: The model selected when creating the adapter (undefined if not selected)
 */
export interface VideoAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> {
  /** Discriminator for adapter kind - used to determine API shape */
  readonly kind: 'video'
  /** Adapter name identifier */
  readonly name: string
  /** Supported video generation models */
  readonly models: TModels
  /** The model selected when creating the adapter */
  readonly selectedModel: TSelectedModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  ~types: {
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
 * Abstract base class for video generation adapters.
 * Extend this class to implement a video adapter for a specific provider.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export abstract class BaseVideoAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> implements VideoAdapter<TModels, TProviderOptions, TSelectedModel> {
  readonly kind = 'video' as const
  abstract readonly name: string
  abstract readonly models: TModels
  readonly selectedModel: TSelectedModel

  // Type-only property - never assigned at runtime
  declare ~types: {
    providerOptions: TProviderOptions
  }

  protected config: VideoAdapterConfig

  constructor(config: VideoAdapterConfig = {}, selectedModel?: TSelectedModel) {
    this.config = config
    this.selectedModel = selectedModel as TSelectedModel
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
