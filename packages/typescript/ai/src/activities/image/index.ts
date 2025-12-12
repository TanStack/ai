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
  TAdapter extends ImageAdapter<infer M, any, any, any> ? M[number] : string

/**
 * Extract model-specific provider options from an ImageAdapter.
 * If the model has specific options defined in ModelProviderOptions (and not just via index signature),
 * use those; otherwise fall back to base provider options.
 */
export type ImageProviderOptionsForModel<TAdapter, TModel extends string> =
  TAdapter extends ImageAdapter<any, infer BaseOptions, infer ModelOptions, any>
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
  TAdapter extends ImageAdapter<any, any, any, infer SizeByName>
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
 *
 * @template TAdapter - The image adapter type
 * @template TModel - The model name type (inferred from adapter)
 */
export interface ImageActivityOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
> {
  /** The image adapter to use */
  adapter: TAdapter & { kind: typeof kind }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: ImageSizeForModel<TAdapter, TModel>
  /** Provider-specific options for image generation */
  providerOptions?: ImageProviderOptionsForModel<TAdapter, TModel>
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
 * import { ai } from '@tanstack/ai'
 * import { openaiImage } from '@tanstack/ai-openai'
 *
 * const result = await ai({
 *   adapter: openaiImage(),
 *   model: 'dall-e-3',
 *   prompt: 'A serene mountain landscape at sunset'
 * })
 *
 * console.log(result.images[0].url)
 * ```
 *
 * @example Generate multiple images
 * ```ts
 * const result = await ai({
 *   adapter: openaiImage(),
 *   model: 'dall-e-2',
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
 * const result = await ai({
 *   adapter: openaiImage(),
 *   model: 'dall-e-3',
 *   prompt: 'A professional headshot photo',
 *   size: '1024x1024',
 *   providerOptions: {
 *     quality: 'hd',
 *     style: 'natural'
 *   }
 * })
 * ```
 */
export async function imageActivity<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
>(options: ImageActivityOptions<TAdapter, TModel>): ImageActivityResult {
  const { adapter, ...rest } = options

  return adapter.generateImages(rest)
}

// Re-export adapter types
export type { ImageAdapter, ImageAdapterConfig } from './adapter'
export { BaseImageAdapter } from './adapter'
