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
 * Quality options for dall-e-3 model
 */
export type DallE3Quality = 'hd' | 'standard'

/**
 * Quality options for dall-e-2 model (only standard is supported)
 */
export type DallE2Quality = 'standard'

/**
 * Style options for dall-e-3 model
 */
export type DallE3Style = 'vivid' | 'natural'

/**
 * Output format options for gpt-image-1 models
 */
export type GptImageOutputFormat = 'png' | 'jpeg' | 'webp'

/**
 * Response format options for dall-e models
 */
export type DallEResponseFormat = 'url' | 'b64_json'

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
 * Supported sizes for dall-e-3 model
 */
export type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792'

/**
 * Supported sizes for dall-e-2 model
 */
export type DallE2Size = '256x256' | '512x512' | '1024x1024'

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
 * Provider options for dall-e-3 model
 * Field names match the OpenAI API for direct spreading
 */
export interface DallE3ProviderOptions extends OpenAIImageBaseProviderOptions {
  /**
   * The quality of the image.
   * @default 'standard'
   */
  quality?: DallE3Quality

  /**
   * The style of the generated images.
   * 'vivid' causes the model to lean towards generating hyper-real and dramatic images.
   * 'natural' causes the model to produce more natural, less hyper-real looking images.
   * @default 'vivid'
   */
  style?: DallE3Style

  /**
   * The format in which generated images are returned.
   * URLs are only valid for 60 minutes after generation.
   * @default 'url'
   */
  response_format?: DallEResponseFormat
}

/**
 * Provider options for dall-e-2 model
 * Field names match the OpenAI API for direct spreading
 */
export interface DallE2ProviderOptions extends OpenAIImageBaseProviderOptions {
  /**
   * The quality of the image (only 'standard' is supported).
   */
  quality?: DallE2Quality

  /**
   * The format in which generated images are returned.
   * URLs are only valid for 60 minutes after generation.
   * @default 'url'
   */
  response_format?: DallEResponseFormat
}

/**
 * Union of all OpenAI image provider options
 */
export type OpenAIImageProviderOptions =
  | GptImage1ProviderOptions
  | GptImage1MiniProviderOptions
  | DallE3ProviderOptions
  | DallE2ProviderOptions

/**
 * Type-only map from model name to its specific provider options.
 * Used by the core AI types to narrow providerOptions based on the selected model.
 */
export type OpenAIImageModelProviderOptionsByName = {
  'gpt-image-1': GptImage1ProviderOptions
  'gpt-image-1-mini': GptImage1MiniProviderOptions
  'dall-e-3': DallE3ProviderOptions
  'dall-e-2': DallE2ProviderOptions
}

/**
 * Type-only map from model name to its supported sizes.
 */
export type OpenAIImageModelSizeByName = {
  'gpt-image-1': GptImageSize
  'gpt-image-1-mini': GptImageSize
  'dall-e-3': DallE3Size
  'dall-e-2': DallE2Size
}

/**
 * Internal options interface for validation
 */
interface ImageValidationOptions {
  prompt: string
  model: string
  background?: 'transparent' | 'opaque' | 'auto' | null
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
    'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    'gpt-image-1-mini': ['1024x1024', '1536x1024', '1024x1536', 'auto'],
    'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
    'dall-e-2': ['256x256', '512x512', '1024x1024'],
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
 * Validates that the number of images is within bounds for the model.
 */
export function validateNumberOfImages(
  model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // dall-e-3 only supports n=1
  if (model === 'dall-e-3' && numberOfImages !== 1) {
    throw new Error(
      `Model "dall-e-3" only supports generating 1 image at a time. ` +
        `Requested: ${numberOfImages}`,
    )
  }

  // Other models support 1-10
  if (numberOfImages < 1 || numberOfImages > 10) {
    throw new Error(
      `Number of images must be between 1 and 10. Requested: ${numberOfImages}`,
    )
  }
}

export const validateBackground = (options: ImageValidationOptions) => {
  if (options.background) {
    const supportedModels = ['gpt-image-1', 'gpt-image-1-mini']
    if (!supportedModels.includes(options.model)) {
      throw new Error(
        `The model ${options.model} does not support background option.`,
      )
    }
  }
}

export const validatePrompt = (options: ImageValidationOptions) => {
  if (options.prompt.length === 0) {
    throw new Error('Prompt cannot be empty.')
  }
  if (
    (options.model === 'gpt-image-1' || options.model === 'gpt-image-1-mini') &&
    options.prompt.length > 32000
  ) {
    throw new Error(
      'For gpt-image-1/gpt-image-1-mini, prompt length must be less than or equal to 32000 characters.',
    )
  }
  if (options.model === 'dall-e-2' && options.prompt.length > 1000) {
    throw new Error(
      'For dall-e-2, prompt length must be less than or equal to 1000 characters.',
    )
  }
  if (options.model === 'dall-e-3' && options.prompt.length > 4000) {
    throw new Error(
      'For dall-e-3, prompt length must be less than or equal to 4000 characters.',
    )
  }
}
