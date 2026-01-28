/**
 * Re-export our generated comprehensive type system for full fal.ai model support.
 * Generated from fal.ai's OpenAPI specs with types for 1000+ models across 25 categories.
 * These types give you full autocomplete and type safety for any model.
 */

// Re-export all category-specific types
export type { EndpointTypeMap } from '@fal-ai/client/endpoints'
export * from './generated'

// Import the unified type for convenience
export type { FalModel } from './generated'

/**
 * Utility type to get the input type for any fal.ai model.
 *
 * Note: This is a generic fallback. For better type safety, use category-specific types:
 * - ImageToImageModelInput<T>
 * - TextToImageModelInput<T>
 * - ImageToVideoModelInput<T>
 * etc.
 *
 * @example
 * type FluxInput = FalModelInput<'fal-ai/flux/dev'>
 */
export type FalModelInput<TModel extends string> = TModel extends string
  ? any
  : never

/**
 * Utility type to get the output type for any fal.ai model.
 *
 * Note: This is a generic fallback. For better type safety, use category-specific types:
 * - ImageToImageModelOutput<T>
 * - TextToImageModelOutput<T>
 * - ImageToVideoModelOutput<T>
 * etc.
 *
 * @example
 * type FluxOutput = FalModelOutput<'fal-ai/flux/dev'>
 */
export type FalModelOutput<TModel extends string> = TModel extends string
  ? any
  : never

/**
 * Provider options for image generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in image generation.
 *
 * @example
 * type FluxOptions = FalImageProviderOptions<'fal-ai/flux/dev'>
 */
export type FalImageProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'image_size' | 'num_images'
>

/**
 * Provider options for video generation, excluding fields TanStack AI handles.
 * Use this for the `modelOptions` parameter in video generation.
 */
export type FalVideoProviderOptions<TModel extends string> = Omit<
  FalModelInput<TModel>,
  'prompt' | 'aspect_ratio' | 'duration'
>
