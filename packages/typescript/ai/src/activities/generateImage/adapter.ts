import type { ImageGenerationOptions, ImageGenerationResult } from '../../types'

/**
 * Configuration for image adapter instances
 */
export interface ImageAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

/**
 * Base interface for image generation adapters.
 * Provides type-safe image generation functionality with support for
 * model-specific provider options.
 *
 * Generic parameters:
 * - TModels: Array of supported image model names
 * - TProviderOptions: Base provider-specific options for image generation
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelSizeByName: Map from model name to its supported sizes
 * - TSelectedModel: The model selected when creating the adapter (undefined if not selected)
 */
export interface ImageAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'image'
  /** Adapter name identifier */
  readonly name: string
  /** Supported image generation models */
  readonly models: TModels
  /** The model selected when creating the adapter */
  readonly selectedModel: TSelectedModel

  /**
   * @internal Type-only properties for inference. Not assigned at runtime.
   */
  _types: {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
  }

  /**
   * Generate images from a prompt
   */
  generateImages: (
    options: ImageGenerationOptions<TProviderOptions>,
  ) => Promise<ImageGenerationResult>
}

/**
 * Abstract base class for image generation adapters.
 * Extend this class to implement an image adapter for a specific provider.
 */
export abstract class BaseImageAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
  TSelectedModel extends TModels[number] | undefined = undefined,
> implements ImageAdapter<
  TModels,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName,
  TSelectedModel
> {
  readonly kind = 'image' as const
  abstract readonly name: string
  abstract readonly models: TModels
  readonly selectedModel: TSelectedModel

  // Type-only property - never assigned at runtime
  declare _types: {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
  }

  protected config: ImageAdapterConfig

  constructor(config: ImageAdapterConfig = {}, selectedModel?: TSelectedModel) {
    this.config = config
    this.selectedModel = selectedModel as TSelectedModel
  }

  abstract generateImages(
    options: ImageGenerationOptions<TProviderOptions>,
  ): Promise<ImageGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
