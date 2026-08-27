import type {
  ModelInputModalitiesByName,
  VideoGenerationOptions,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../../types'

export type DurationOptions<T extends string | number | undefined> =
  | { kind: 'discrete'; values: ReadonlyArray<NonNullable<T>> }
  | { kind: 'range'; min: number; max: number; step?: number; unit: 'seconds' }
  | {
      kind: 'mixed'
      values: ReadonlyArray<NonNullable<T>>
      range?: { min: number; max: number; step?: number }
    }
  | { kind: 'none' }

export interface VideoAdapterConfig {
  apiKey?: string
  baseUrl?: string
  timeout?: number
  maxRetries?: number
  headers?: Record<string, string>
}

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

  '~types': {
    providerOptions: TProviderOptions
    modelProviderOptionsByName: TModelProviderOptionsByName
    modelSizeByName: TModelSizeByName
    modelInputModalitiesByName: TModelInputModalitiesByName
    modelDurationByName: TModelDurationByName
  }

  createVideoJob: (
    options: VideoGenerationOptions<
      TProviderOptions,
      TModelSizeByName[TModel],
      TModelDurationByName[TModel]
    >,
  ) => Promise<VideoJobResult>

  getVideoStatus: (jobId: string) => Promise<VideoStatusResult>

  getVideoUrl: (jobId: string) => Promise<VideoUrlResult>

  availableDurations: () => DurationOptions<TModelDurationByName[TModel]>

  snapDuration: (seconds: number) => TModelDurationByName[TModel] | undefined
}

export type AnyVideoAdapter = VideoAdapter<any, any, any, any, any, any>

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

  availableDurations(): DurationOptions<TModelDurationByName[TModel]> {
    return { kind: 'none' }
  }

  snapDuration(_seconds: number): TModelDurationByName[TModel] | undefined {
    return undefined
  }

  protected generateId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
