/**
 * Image Activity
 *
 * Generates images from text prompts.
 * This is a self-contained module with implementation, types, and JSDoc.
 */

import { aiEventClient } from '../../event-client.js'
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

/**
 * Extract model-specific provider options from an ImageAdapter via ~types.
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
 * Extract model-specific size options from an ImageAdapter via ~types.
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
 * The model is extracted from the adapter's model property.
 *
 * @template TAdapter - The image adapter type
 */
export type ImageActivityOptions<
  TAdapter extends ImageAdapter<string, any, any, any>,
> = {
  /** The image adapter to use (must be created with a model) */
  adapter: TAdapter & { kind: typeof kind }
  /** Text description of the desired image(s) */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") */
  size?: ImageSizeForModel<TAdapter, TAdapter['model']>
} & ({} extends ImageProviderOptionsForModel<TAdapter, TAdapter['model']>
  ? {
      /** Provider-specific options for image generation */ modelOptions?: ImageProviderOptionsForModel<
        TAdapter,
        TAdapter['model']
      >
    }
  : {
      /** Provider-specific options for image generation */ modelOptions: ImageProviderOptionsForModel<
        TAdapter,
        TAdapter['model']
      >
    })

// ===========================
// Activity Result Type
// ===========================

/** Result type for the image activity */
export type ImageActivityResult = Promise<ImageGenerationResult>

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

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
  TAdapter extends ImageAdapter<string, any, any, any>,
>(options: ImageActivityOptions<TAdapter>): ImageActivityResult {
  const { adapter, ...rest } = options
  const model = adapter.model
  const requestId = createId('image')
  const startTime = Date.now()

  aiEventClient.emit('image:request:started', {
    requestId,
    provider: adapter.name,
    model,
    prompt: rest.prompt,
    numberOfImages: rest.numberOfImages,
    size: rest.size,
    modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
    timestamp: startTime,
  })

  return adapter.generateImages({ ...rest, model }).then((result) => {
    const duration = Date.now() - startTime

    aiEventClient.emit('image:request:completed', {
      requestId,
      provider: adapter.name,
      model,
      images: result.images.map((image) => ({
        url: image.url,
        b64Json: image.b64Json,
      })),
      duration,
      modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
      timestamp: Date.now(),
    })

    if (result.usage) {
      aiEventClient.emit('image:usage', {
        requestId,
        model,
        usage: result.usage,
        modelOptions: rest.modelOptions as Record<string, unknown> | undefined,
        timestamp: Date.now(),
      })
    }

    return result
  })
}

// ===========================
// Options Factory
// ===========================

/**
 * Create typed options for the generateImage() function without executing.
 */
export function createImageOptions<
  TAdapter extends ImageAdapter<string, any, any, any>,
>(options: ImageActivityOptions<TAdapter>): ImageActivityOptions<TAdapter> {
  return options
}

// Re-export adapter types
export type {
  ImageAdapter,
  ImageAdapterConfig,
  AnyImageAdapter,
} from './adapter'
export { BaseImageAdapter } from './adapter'
