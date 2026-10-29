/**
 * OpenAI Image Generation Provider Options
 *
 * These are provider-specific options for OpenAI image generation.
 * Common options like prompt, numberOfImages, and size are handled
 * in the base ImageGenerationOptions.
 */

/**
 * Quality options for gpt-image-1 and gpt-image-1-mini models
 */
export type GptImageQuality = 'high' | 'medium' | 'low' | 'auto'

/**
 * Quality options for gpt-image-2.5-flare and gpt-image-2.5-sunburst models
 */
export type GptImage25Quality = GptImageQuality | 'xhigh' | 'max'

/**
 * Output format options for gpt-image-1 models
 */
export type GptImageOutputFormat = 'png' | 'jpeg' | 'webp'

/**
 * Background options for gpt-image-1 models
 */
export type GptImageBackground = 'transparent' | 'opaque' | 'auto'

/**
 * Moderation level for gpt-image-1 models
 */
export type GptImageModeration = 'low' | 'auto'

/**
 * Supported sizes for gpt-image-1 models
 */
export type GptImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto'

/**
 * Base provider options shared across all OpenAI image models
 */
export interface OpenAIImageBaseProviderOptions {
  /**
   * A unique identifier representing your end-user.
   * Can help OpenAI to monitor and detect abuse.
   */
  user?: string
}

/**
 * Provider options for gpt-image-1 model
 * Field names match the OpenAI API for direct spreading
 */
export interface GptImage1ProviderOptions extends OpenAIImageBaseProviderOptions {
  /**
   * The quality of the image.
   * @default 'auto'
   */
  quality?: GptImageQuality

  /**
   * Background transparency setting.
   * When 'transparent', output format must be 'png' or 'webp'.
   * @default 'auto'
   */
  background?: GptImageBackground

  /**
   * Output image format.
   * @default 'png'
   */
  output_format?: GptImageOutputFormat

  /**
   * Compression level (0-100%) for webp/jpeg formats.
   * @default 100
   */
  output_compression?: number

  /**
   * Content moderation level.
   * @default 'auto'
   */
  moderation?: GptImageModeration

  /**
   * Number of partial images to generate during streaming (0-3).
   * Only used when stream: true.
   * @default 0
   */
  partial_images?: number
}

/**
 * Provider options for gpt-image-1-mini model
 * Same as gpt-image-1
 */
export type GptImage1MiniProviderOptions = GptImage1ProviderOptions

/**
 * Provider options for gpt-image-2.5-flare and gpt-image-2.5-sunburst models.
 * Same as gpt-image-1, plus the `xhigh` and `max` quality levels.
 */
export interface GptImage25ProviderOptions extends Omit<
  GptImage1ProviderOptions,
  'quality'
> {
  /**
   * The quality of the image.
   * @default 'auto'
   */
  quality?: GptImage25Quality
}

/**
 * Union of all OpenAI image provider options
 */
export type OpenAIImageProviderOptions =
  | GptImage25ProviderOptions
  | GptImage1ProviderOptions
  | GptImage1MiniProviderOptions

/**
 * Type-only map from model name to its specific provider options.
 * Used by the core AI types to narrow providerOptions based on the selected model.
 */
export type OpenAIImageModelProviderOptionsByName = {
  'gpt-image-2.5-flare': GptImage25ProviderOptions
  'gpt-image-2.5-sunburst': GptImage25ProviderOptions
  'gpt-image-2': GptImage1ProviderOptions
  'gpt-image-1': GptImage1ProviderOptions
  'gpt-image-1-mini': GptImage1MiniProviderOptions
}

/**
 * Type-only map from model name to its supported sizes.
 */
export type OpenAIImageModelSizeByName = {
  'gpt-image-2.5-flare': GptImageSize
  'gpt-image-2.5-sunburst': GptImageSize
  'gpt-image-2': GptImageSize
  'gpt-image-1': GptImageSize
  'gpt-image-1-mini': GptImageSize
}

/**
 * Per-model prompt input modalities. Every gpt-image model supports
 * `images.edit()`, so each accepts image parts in the prompt.
 */
export type OpenAIImageModelInputModalitiesByName = {
  'gpt-image-2.5-flare': readonly ['image']
  'gpt-image-2.5-sunburst': readonly ['image']
  'gpt-image-2': readonly ['image']
  'gpt-image-1': readonly ['image']
  'gpt-image-1-mini': readonly ['image']
}

/**
 * Internal options interface for validation
 */
interface ImageValidationOptions {
  prompt: string
  model: string
}

/**
 * Validates that the provided size is supported by the model.
 * Throws a descriptive error if the size is not supported.
 */
export function validateImageSize(
  model: string,
  size: string | undefined,
): void {
  if (!size || size === 'auto') return

  const validSizes: Record<string, Array<string>> = {
    'gpt-image-2.5-flare': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    'gpt-image-2.5-sunburst': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    'gpt-image-2': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    'gpt-image-1-mini': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
  }

  const modelSizes = validSizes[model]
  if (!modelSizes) {
    throw new Error(`Unknown image model: ${model}`)
  }

  if (!modelSizes.includes(size)) {
    throw new Error(
      `Size "${size}" is not supported by model "${model}". ` +
        `Supported sizes: ${modelSizes.join(', ')}`,
    )
  }
}

/**
 * Validates that the number of images is within bounds (1-10).
 */
export function validateNumberOfImages(
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  if (numberOfImages < 1 || numberOfImages > 10) {
    throw new Error(
      `Number of images must be between 1 and 10. Requested: ${numberOfImages}`,
    )
  }
}

export const validatePrompt = (options: ImageValidationOptions) => {
  if (options.prompt.length === 0) {
    throw new Error('Prompt cannot be empty.')
  }
  if (
    (options.model === 'gpt-image-2' ||
      options.model === 'gpt-image-1' ||
      options.model === 'gpt-image-1-mini') &&
    options.prompt.length > 32000
  ) {
    throw new Error(
      'For gpt-image-2/gpt-image-1/gpt-image-1-mini, prompt length must be less than or equal to 32000 characters.',
    )
  }
}
