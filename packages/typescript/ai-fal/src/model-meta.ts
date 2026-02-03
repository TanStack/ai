/**
 * Re-export fal.ai's comprehensive type system for full model support.
 * The fal.ai SDK provides types for 600+ models through EndpointTypeMap.
 * These types give you full autocomplete and type safety for any model.
 */
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'
import type { ImageGenerationOptions } from '@tanstack/ai'

export type { EndpointTypeMap } from '@fal-ai/client/endpoints'

/**
 * All known fal.ai model IDs with autocomplete support.
 * Also accepts any string for custom/new models.
 */
export type FalModel = keyof EndpointTypeMap | string

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
    : Record<string, any>

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
  'image_size' extends keyof FalModelInput<TModel>
    ? Exclude<FalModelInput<TModel>['image_size'], object>
    : never

/**
 * Provider options for image generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in image generation.
 *
 * @example
 * type FluxOptions = FalImageProviderOptions<'fal-ai/flux/dev'>
 * // { num_inference_steps?: number; guidance_scale?: number; seed?: number; ... }
 */
export type FalImageProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'image_size' | 'num_images'
>

export type FalImageGenerationOptions<TModel extends string> = Omit<
  ImageGenerationOptions<FalImageProviderOptions<TModel>>,
  'model'
>

/**
 * Provider options for video generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in video generation.
 */
export type FalVideoProviderOptions<TModel extends string> =
  TModel extends keyof EndpointTypeMap
    ? Omit<FalModelInput<TModel>, 'prompt' | 'duration'>
    : Record<string, any>
