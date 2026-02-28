/**
 * Grok Image Generation Provider Options
 *
 * These are provider-specific options for Grok image generation.
 * Grok uses the grok-2-image-1212 model for image generation.
 */

/**
 * Supported sizes for grok-2-image-1212 model
 */
export type GrokImageSize = '1024x1024' | '1536x1024' | '1024x1536'

/**
 * Base provider options for Grok image models
 */
export interface GrokImageBaseProviderOptions {
  /**
   * A unique identifier representing your end-user.
   * Can help xAI to monitor and detect abuse.
   */
  user?: string
}

/**
 * Provider options for grok-2-image-1212 model
 */
export interface GrokImageProviderOptions extends GrokImageBaseProviderOptions {
  /**
   * The quality of the image.
   * @default 'standard'
   */
  quality?: 'standard' | 'hd'

  /**
   * The format in which generated images are returned.
   * URLs are only valid for 60 minutes after generation.
   * @default 'url'
   */
  response_format?: 'url' | 'b64_json'
}

/**
 * Type-only map from model name to its specific provider options.
 */
export type GrokImageModelProviderOptionsByName = {
  'grok-2-image-1212': GrokImageProviderOptions
}

/**
 * Type-only map from model name to its supported sizes.
 */
export type GrokImageModelSizeByName = {
  'grok-2-image-1212': GrokImageSize
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
  if (!size) return

  const validSizes: Record<string, Array<string>> = {
    'grok-2-image-1212': ['1024x1024', '1536x1024', '1024x1536'],
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
  _model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // grok-2-image-1212 supports 1-10 images per request
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
  // Grok image model supports up to 4000 characters
  if (options.prompt.length > 4000) {
    throw new Error(
      'For grok-2-image-1212, prompt length must be less than or equal to 4000 characters.',
    )
  }
}
