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
 */
export interface ImageAdapter<
  TModels extends ReadonlyArray<string> = ReadonlyArray<string>,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'image'
  /** Adapter name identifier */
  readonly name: string
  /** Supported image generation models */
  readonly models: TModels

  // Type-only properties for type inference
  /** @internal Type-only property for provider options inference */
  _providerOptions?: TProviderOptions
  /** @internal Type-only map from model name to its specific provider options */
  _modelProviderOptionsByName?: TModelProviderOptionsByName
  /** @internal Type-only map from model name to its supported sizes */
  _modelSizeByName?: TModelSizeByName

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
> implements ImageAdapter<
  TModels,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName
> {
  readonly kind = 'image' as const
  abstract readonly name: string
  abstract readonly models: TModels

  // Type-only properties - never assigned at runtime
  declare _providerOptions?: TProviderOptions
  declare _modelProviderOptionsByName?: TModelProviderOptionsByName
  declare _modelSizeByName?: TModelSizeByName

  protected config: ImageAdapterConfig

  constructor(config: ImageAdapterConfig = {}) {
    this.config = config
  }

  abstract generateImages(
    options: ImageGenerationOptions<TProviderOptions>,
  ): Promise<ImageGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
