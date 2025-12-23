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
   */
  quality?: 'low' | 'medium' | 'high'

  /**
   * The format in which generated images are returned.
   * URLs are only valid for 60 minutes after generation.
   * @default 'url'
   */
  response_format?: 'url' | 'b64_json'
}

/**
 * Internal options interface for validation
 */
interface ImageValidationOptions {
  prompt: string
  model: string
}

/**
 * Validates that the number of images is within bounds for the model.
 */
export function validateNumberOfImages(
  _model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // grok-2-image supports 1-10 images per request
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
      'For grok-2-image, prompt length must be less than or equal to 4000 characters.',
    )
  }
}
