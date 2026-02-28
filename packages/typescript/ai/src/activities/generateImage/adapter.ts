import type { ImageGenerationOptions, ImageGenerationResult } from '../../types'

/**
 * Resolve the size type for a model from the model-size map.
 * If the map has an index signature (i.e. no explicit keys), falls back to string.
 * If the model is an explicit key, uses its mapped size type.
 * Otherwise falls back to string.
 */

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
 * Image adapter interface with pre-resolved generics.
 *
 * An adapter is created by a provider function: `provider('model')` → `adapter`
 * All type resolution happens at the provider call site, not in this interface.
 *
 * Generic parameters:
 * - TModel: The specific model name (e.g., 'dall-e-3')
 * - TProviderOptions: Base provider-specific options (already resolved)
 * - TModelProviderOptionsByName: Map from model name to its specific provider options
 * - TModelSizeByName: Map from model name to its supported sizes
 */
export interface ImageAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'image'
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
  }

  /**
   * Generate images from a prompt
   */
  generateImages: (
    options: ImageGenerationOptions<TProviderOptions, TModelSizeByName[TModel]>,
  ) => Promise<ImageGenerationResult>
}

/**
 * An ImageAdapter with any/unknown type parameters.
 * Useful as a constraint in generic functions and interfaces.
 */
export type AnyImageAdapter = ImageAdapter<any, any, any, any>

/**
 * Abstract base class for image generation adapters.
 * Extend this class to implement an image adapter for a specific provider.
 *
 * Generic parameters match ImageAdapter - all pre-resolved by the provider function.
 */
export abstract class BaseImageAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
> implements ImageAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName
> {
  readonly kind = 'image' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
  }

  protected config: ImageAdapterConfig

  constructor(config: ImageAdapterConfig = {}, model: TModel) {
    this.config = config
    this.model = model
  }

  abstract generateImages(
    options: ImageGenerationOptions<TProviderOptions, TModelSizeByName[TModel]>,
  ): Promise<ImageGenerationResult>

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
