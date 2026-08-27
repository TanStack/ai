import type { EndpointTypeMap } from '@fal-ai/client/endpoints'
import type { MediaPromptModality } from '@tanstack/ai'
import type { FalImageFieldName } from './image/generated/image-field-overrides'

export type { EndpointTypeMap } from '@fal-ai/client/endpoints'

export type FalModel = keyof EndpointTypeMap | (string & {})

export type FalModelInput<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? EndpointTypeMap[TModel]['input']
    : Record<string, unknown>

export type FalModelOutput<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? EndpointTypeMap[TModel]['output']
    : unknown

export type FalModelImageSize<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? 'image_size' extends keyof EndpointTypeMap[TModel]['input']
      ? NonNullable<Exclude<FalModelInput<TModel>['image_size'], object>>
      : 'aspect_ratio' extends keyof EndpointTypeMap[TModel]['input']
        ? 'resolution' extends keyof EndpointTypeMap[TModel]['input']
          ? `${Extract<NonNullable<FalModelInput<TModel>['aspect_ratio']>, string>}_${Extract<NonNullable<FalModelInput<TModel>['resolution']>, string>}`
          : Extract<NonNullable<FalModelInput<TModel>['aspect_ratio']>, string>
        : undefined
    : string

export type FalModelImageSizeInput<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? 'aspect_ratio' extends keyof EndpointTypeMap[TModel]['input']
      ? 'resolution' extends keyof EndpointTypeMap[TModel]['input']
        ? {
            aspect_ratio: FalModelInput<TModel>['aspect_ratio']
            resolution: FalModelInput<TModel>['resolution']
          }
        : { aspect_ratio: NonNullable<FalModelInput<TModel>['aspect_ratio']> }
      : 'image_size' extends keyof EndpointTypeMap[TModel]['input']
        ? { image_size: FalModelImageSize<TModel> }
        : never
    : { image_size: string }

type FalMediaInputFieldName =
  | FalImageFieldName
  | 'video_url'
  | 'video_urls'
  | 'reference_video_urls'
  | 'audio_url'

type WithOptionalMediaInputFields<TInput> = Omit<
  TInput,
  Extract<keyof TInput, FalMediaInputFieldName>
> &
  Partial<Pick<TInput, Extract<keyof TInput, FalMediaInputFieldName>>>

export type FalImageProviderOptions<TModel extends string> =
  WithOptionalMediaInputFields<Omit<FalModelInput<TModel>, 'prompt'>>

export type FalModelVideoSize<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? 'aspect_ratio' extends keyof EndpointTypeMap[TModel]['input']
      ? 'resolution' extends keyof EndpointTypeMap[TModel]['input']
        ? `${Extract<NonNullable<FalModelInput<TModel>['aspect_ratio']>, string>}_${Extract<NonNullable<FalModelInput<TModel>['resolution']>, string>}`
        : Extract<NonNullable<FalModelInput<TModel>['aspect_ratio']>, string>
      : 'resolution' extends keyof EndpointTypeMap[TModel]['input']
        ? Extract<NonNullable<FalModelInput<TModel>['resolution']>, string>
        : undefined
    : string

export type FalModelVideoSizeInput<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? 'aspect_ratio' extends keyof EndpointTypeMap[TModel]['input']
      ? 'resolution' extends keyof EndpointTypeMap[TModel]['input']
        ? {
            aspect_ratio: FalModelInput<TModel>['aspect_ratio']
            resolution: FalModelInput<TModel>['resolution']
          }
        : { aspect_ratio: NonNullable<FalModelInput<TModel>['aspect_ratio']> }
      : 'resolution' extends keyof EndpointTypeMap[TModel]['input']
        ? { resolution: NonNullable<FalModelInput<TModel>['resolution']> }
        : never
    : { aspect_ratio?: string; resolution?: string }

export type FalModelVideoDuration<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? 'duration' extends keyof EndpointTypeMap[TModel]['input']
      ? Extract<
          NonNullable<
            EndpointTypeMap[TModel]['input'] extends { duration?: infer D }
              ? D
              : never
          >,
          string | number
        >
      : undefined
    : string | number | undefined

export type FalImagePromptModalitiesFor<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? ReadonlyArray<
        Extract<keyof FalModelInput<TModel>, FalImageFieldName> extends never
          ? never
          : 'image'
      >
    : ReadonlyArray<MediaPromptModality>

export type FalVideoPromptModalitiesFor<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? ReadonlyArray<
        | (Extract<keyof FalModelInput<TModel>, FalImageFieldName> extends never
            ? never
            : 'image')
        | (Extract<
            keyof FalModelInput<TModel>,
            'video_url' | 'video_urls' | 'reference_video_urls'
          > extends never
            ? never
            : 'video')
        | (Extract<keyof FalModelInput<TModel>, 'audio_url'> extends never
            ? never
            : 'audio')
      >
    : ReadonlyArray<MediaPromptModality>

export type FalVideoProviderOptions<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? WithOptionalMediaInputFields<
        Omit<FalModelInput<TModel>, 'prompt' | 'duration'>
      >
    : Record<string, unknown>

export type FalSpeechProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'text'
>

export type FalTranscriptionProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'audio_url'
>

export type FalAudioProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt'
>
