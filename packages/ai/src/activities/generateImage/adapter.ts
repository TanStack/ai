import type {
  ImageGenerationOptions,
  ImageGenerationResult,
  ModelInputModalitiesByName,
} from '../../types'

export interface ImageAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

export interface ImageAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string | undefined> = Record<
    string,
    string
  >,
  TModelInputModalitiesByName extends ModelInputModalitiesByName =
    ModelInputModalitiesByName,
> {
  /** Discriminator for adapter kind - used by generate() to determine API shape */
  readonly kind: 'image'
  /** Adapter name identifier */
  readonly name: string
  /** The model this adapter is configured for */
  readonly model: TModel

  '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  generateImages: (
    options: ImageGenerationOptions<TProviderOptions, TModelSizeByName[TModel]>,
  ) => Promise<ImageGenerationResult>
}

export type AnyImageAdapter = ImageAdapter<any, any, any, any, any>

export abstract class BaseImageAdapter<
  TModel extends string = string,
  TProviderOptions extends object = Record<string, unknown>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string | undefined> = Record<
    string,
    string
  >,
  TModelInputModalitiesByName extends ModelInputModalitiesByName =
    ModelInputModalitiesByName,
> implements ImageAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName,
  TModelInputModalitiesByName
> {
  readonly kind = 'image' as const
  abstract readonly name: string
  readonly model: TModel

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
    modelInputModalitiesByName: TModelInputModalitiesByName
  }

  protected config: ImageAdapterConfig

  constructor(model: TModel, config: ImageAdapterConfig = {}) {
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
