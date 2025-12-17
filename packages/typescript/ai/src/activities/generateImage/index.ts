/**
 * Image Activity
 *
 * Generates images from text prompts.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import type { ImageAdapter } from './adapter'
import type { ImageGenerationResult } from '../../types'

// ===========================
// Activity Kind
// ===========================

/** The adapter kind this activity handles */
export const kind = 'image' as const

// ===========================
// Type Extraction Helpers
// ===========================

/** Extract model types from an ImageAdapter */
export type ImageModels<TAdapter> =
  TAdapter extends ImageAdapter<infer M, any, any, any, any> ? M[number] : string

/** Extract the selected model from an ImageAdapter */
export type ImageSelectedModel<TAdapter> =
  TAdapter extends ImageAdapter<any, any, any, any, infer TSelectedModel>
  ? TSelectedModel
  : undefined

/**
 * Extract model-specific provider options from an ImageAdapter.
 * If the model has specific options defined in ModelProviderOptions (and not just via index signature),
 * use those; otherwise fall back to base provider options.
 */
export type ImageProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<
    any,
    infer BaseOptions,
    infer ModelOptions,
    any,
    any
  >
  ? string extends keyof ModelOptions
  ? // ModelOptions is Record<string, unknown> or has index signature - use BaseOptions
  BaseOptions
  : // ModelOptions has explicit keys - check if TModel is one of them
  TModel extends keyof ModelOptions
  ? ModelOptions[TModel]
  : BaseOptions
  : object

/**
 * Extract model-specific size options from an ImageAdapter.
 * If the model has specific sizes defined, use those; otherwise fall back to string.
 */
export type ImageSizeForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, any, any, infer SizeByName, any>
  ? string extends keyof SizeByName
  ? // SizeByName has index signature - fall back to string
  string
  : // SizeByName has explicit keys - check if TModel is one of them
  TModel extends keyof SizeByName
  ? SizeByName[TModel]
  : string
  : string

// ===========================
// Activity Options Type
// ===========================

/**
 * Options for the image activity.
 * The model is extracted from the adapter's selectedModel property.
 *
 * @template TAdapter - The image adapter type (must have a selectedModel)
 */
export interface ImageActivityOptions<
  TAdapter extends ImageAdapter<
    ReadonlyArray<string>,
    object,
    any,
    any,
    string
  >,
> {
  /** The image adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: ImageSizeForModel<TAdapter, ImageSelectedModel<TAdapter> & string>
  /** Provider-specific options for image generation */
  modelOptions?: ImageProviderOptionsForModel<
    TAdapter,
    ImageSelectedModel<TAdapter> & string
  >
}

// ===========================
// Activity Result Type
// ===========================

/** Result type for the image activity */
export type ImageActivityResult = Promise<ImageGenerationResult>

// ===========================
// Activity Implementation
// ===========================

/**
 * Image activity - generates images from text prompts.
 *
 * Uses AI image generation models to create images based on natural language descriptions.
 *
 * @example Generate a single image
 * ```ts
 * import { generateImage } from '@tanstack/ai'
 * import { openaiImage } from '@tanstack/ai-openai'
 *
 * const result = await generateImage({
 *   adapter: openaiImage('dall-e-3'),
 *   prompt: 'A serene mountain landscape at sunset'
 * })
 *
 * console.log(result.images[0].url)
 * ```
 *
 * @example Generate multiple images
 * ```ts
 * const result = await generateImage({
 *   adapter: openaiImage('dall-e-2'),
 *   prompt: 'A cute robot mascot',
 *   numberOfImages: 4,
 *   size: '512x512'
 * })
 *
 * result.images.forEach((image, i) => {
 *   console.log(`Image ${i + 1}: ${image.url}`)
 * })
 * ```
 *
 * @example With provider-specific options
 * ```ts
 * const result = await generateImage({
 *   adapter: openaiImage('dall-e-3'),
 *   prompt: 'A professional headshot photo',
 *   size: '1024x1024',
 *   modelOptions: {
 *     quality: 'hd',
 *     style: 'natural'
 *   }
 * })
 * ```
 */
export async function generateImage<
  TAdapter extends ImageAdapter<
    ReadonlyArray<string>,
    object,
    any,
    any,
    string
  >,
>(options: ImageActivityOptions<TAdapter>): ImageActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.selectedModel

  return adapter.generateImages({ ...rest, model })
}

// Re-export adapter types
export type { ImageAdapter, ImageAdapterConfig } from './adapter'
export { BaseImageAdapter } from './adapter'
