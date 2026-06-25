/**
 * Re-export fal.ai's comprehensive type system for full model support.
 * The fal.ai SDK provides types for 600+ models through EndpointTypeMap.
 * These types give you full autocomplete and type safety for any model.
 */
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'
import type { MediaPromptModality } from '@tanstack/ai'
import type { FalImageFieldName } from './image/generated/image-field-overrides'

export type { EndpointTypeMap } from '@fal-ai/client/endpoints'

/**
 * All known fal.ai model IDs with autocomplete support.
 * Also accepts any string for custom/new models.
 */
export type FalModel = keyof EndpointTypeMap | (string & {})

/**
 * Utility type to extract the input type for a specific fal model.
 *
 * @example
 * type FluxInput = FalModelInput<'fal-ai/flux/dev'>
 * // { prompt: string; num_inference_steps?: number; ... }
 */
export type FalModelInput<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? EndpointTypeMap[TModel]['input']
    : Record<string, unknown>

/**
 * Utility type to extract the output type for a specific fal model.
 *
 * @example
 * type FluxOutput = FalModelOutput<'fal-ai/flux/dev'>
 * // { images: Array<Image>; seed: number; ... }
 */
export type FalModelOutput<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? EndpointTypeMap[TModel]['output']
    : unknown

/**
 * Extract the image_size type supported by a specific fal model.
 * Returns never if the model doesn't support image_size.
 *
 * @example
 * type FluxSize = FalModelImageSize<'fal-ai/flux/dev'>
 * // "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | ...
 */
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

/**
 * Input fields the prompt-part mappers can populate: image conditioning via
 * the generated `FalImageFieldName` set, video conditioning via
 * `video_url` / `video_urls` / `reference_video_urls`, audio via `audio_url`.
 */
type FalMediaInputFieldName =
  | FalImageFieldName
  | 'video_url'
  | 'video_urls'
  | 'reference_video_urls'
  | 'audio_url'

/**
 * Demote an endpoint input's media-conditioning fields from required to
 * optional. Image-to-video endpoints declare e.g. `image_url` as a required
 * input, but with a multimodal `prompt` the start frame usually arrives as a
 * prompt part — requiring it in `modelOptions` too would force redundancy.
 * The fields stay passable via `modelOptions` as the documented escape hatch
 * (and override-wise the mapped prompt-part fields win on conflict).
 */
type WithOptionalMediaInputFields<TInput> = Omit<
  TInput,
  Extract<keyof TInput, FalMediaInputFieldName>
> &
  Partial<Pick<TInput, Extract<keyof TInput, FalMediaInputFieldName>>>

/**
 * Provider options for image generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in image generation.
 *
 * @example
 * type FluxOptions = FalImageProviderOptions<'fal-ai/flux/dev'>
 * // { num_inference_steps?: number; guidance_scale?: number; seed?: number; ... }
 */
export type FalImageProviderOptions<TModel extends string> =
  WithOptionalMediaInputFields<Omit<FalModelInput<TModel>, 'prompt'>>

/**
 * Extract the video size type supported by a specific fal model.
 * Video models typically use aspect_ratio and/or resolution fields.
 *
 * - aspect_ratio + resolution → "16:9_720p"
 * - aspect_ratio only → "16:9"
 * - resolution only → "720p"
 * - neither → undefined (the model takes no size param)
 * - unknown models → string
 */
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

/**
 * Prompt input modalities for a fal image endpoint, derived from the SDK's
 * endpoint input type: an endpoint accepts image prompt parts exactly when
 * its input declares one of the known image-conditioning fields
 * (`image_url`, `image_urls`, `mask_url`, …). Endpoints unknown to the
 * installed SDK are unconstrained.
 */
export type FalImagePromptModalitiesFor<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? ReadonlyArray<
        Extract<keyof FalModelInput<TModel>, FalImageFieldName> extends never
          ? never
          : 'image'
      >
    : ReadonlyArray<MediaPromptModality>

/**
 * Prompt input modalities for a fal video endpoint. Image conditioning is
 * detected via the same field set as image endpoints; video conditioning via
 * `video_url` / `video_urls` / `reference_video_urls`; audio conditioning
 * via `audio_url`. Endpoints unknown to the installed SDK are unconstrained.
 */
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

/**
 * Provider options for video generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in video generation.
 *
 * Media-conditioning fields (start/end frame, reference images, source
 * video/audio) are optional here even when the endpoint requires them —
 * they're usually supplied as prompt parts instead.
 */
export type FalVideoProviderOptions<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? WithOptionalMediaInputFields<Omit<FalModelInput<TModel>, 'prompt'>>
    : Record<string, unknown>

/**
 * Provider options for TTS, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in speech generation.
 */
export type FalSpeechProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'text'
>

/**
 * Provider options for transcription, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in transcription.
 */
export type FalTranscriptionProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'audio_url'
>

/**
 * Provider options for audio generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in audio generation.
 */
export type FalAudioProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt'
>
