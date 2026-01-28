/**
 * Re-export our generated comprehensive type system for full fal.ai model support.
 * Generated from fal.ai's OpenAPI specs with types for 1000+ models across 25 categories.
 * These types give you full autocomplete and type safety for any model.
 */

// Import for use in this file
import type {
  FalImageInput,
  FalImageModel,
  FalVideoInput,
  FalVideoModel,
} from './generated'

/**
 * Provider options for image generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in image generation.
 *
 * @example
 * type FluxOptions = FalImageProviderOptions<'fal-ai/flux/dev'>
 */
export type FalImageProviderOptions<TModel extends FalImageModel> = Omit<
  FalImageInput<TModel>,
  'model' | 'prompt' | 'image_size' | 'num_images' | 'aspect_ratio'
>

/**
 * Provider options for video generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in video generation.
 */
export type FalVideoProviderOptions<TModel extends FalVideoModel> = Omit<
  FalVideoInput<TModel>,
  | 'model'
  | 'prompt'
  | 'aspect_ratio'
  | 'duration'
  | 'aspect_ratio'
  | 'resolution'
>
