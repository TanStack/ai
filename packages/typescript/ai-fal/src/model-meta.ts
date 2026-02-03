/**
 * Re-export fal.ai's comprehensive type system for full model support.
 * The fal.ai SDK provides types for 600+ models through EndpointTypeMap.
 * These types give you full autocomplete and type safety for any model.
 */
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'

export type { EndpointTypeMap } from '@fal-ai/client/endpoints'

/**
 * All known fal.ai model IDs with autocomplete support.
 * Also accepts any string for custom/new models.
 */
export type FalModelTest = 'fal-ai/nano-banana-pro/edit'
export type FalModel = keyof EndpointTypeMap

/**
 * Utility type to extract the input type for a specific fal model.
 *
 * @example
 * type FluxInput = FalModelInput<'fal-ai/flux/dev'>
 * // { prompt: string; num_inference_steps?: number; ... }
 */
export type FalModelInput<TModel extends FalModel> =
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
export type FalModelOutput<TModel extends FalModel> =
  TModel extends keyof EndpointTypeMap
    ? EndpointTypeMap[TModel]['output']
    : unknown

/**
 * Provider options for image generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in image generation.
 *
 * @example
 * type FluxOptions = FalImageProviderOptions<'fal-ai/flux/dev'>
 * // { num_inference_steps?: number; guidance_scale?: number; seed?: number; ... }
 */
export type FalImageProviderOptions<TModel extends FalModel> = Omit<
  FalModelInput<TModel>,
  'prompt'
>

/**
 * Provider options for video generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in video generation.
 */
export type FalVideoProviderOptions<TModel extends FalModel> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'aspect_ratio' | 'duration'
>
