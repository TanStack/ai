import { IMAGE_MODELS } from '../models/image'

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
 * Internal options interface for validation
 */
interface ImageValidationOptions {
  prompt: string
  model: string
  background?: 'transparent' | 'opaque' | 'auto' | null
}

function getImageModelMeta(model: string) {
  if (!Object.hasOwn(IMAGE_MODELS, model)) {
    throw new Error(`Unknown image model: ${model}`)
  }

  return IMAGE_MODELS[model as keyof typeof IMAGE_MODELS]
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

  const modelMeta = getImageModelMeta(model)
  const modelSizes = modelMeta.sizes

  if (!(modelSizes as ReadonlyArray<string>).includes(size)) {
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

  const modelMeta = getImageModelMeta(model)

  if (numberOfImages < 1 || numberOfImages > modelMeta.maxImages) {
    throw new Error(
      `Number of images must be between 1 and ${modelMeta.maxImages}. Requested: ${numberOfImages}`,
    )
  }
}

/**
 * Validates that the selected image model supports background control.
 */
export const validateBackground = (options: ImageValidationOptions) => {
  if (options.background != null) {
    const modelMeta = getImageModelMeta(options.model)
    if (!('supportsBackground' in modelMeta)) {
      throw new Error(
        `The model ${options.model} does not support background option.`,
      )
    }
  }
}

/**
 * Validates prompt presence and model-specific prompt length limits.
 */
export const validatePrompt = (options: ImageValidationOptions) => {
  if (options.prompt.length === 0) {
    throw new Error('Prompt cannot be empty.')
  }
  const modelMeta = getImageModelMeta(options.model)
  if (options.prompt.length > modelMeta.maxPromptLength) {
    throw new Error(
      `For ${options.model}, prompt length must be less than or equal to ${modelMeta.maxPromptLength} characters.`,
    )
  }
}
