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
 * Aspect ratios accepted by the grok-imagine image models.
 */
export type GrokImagineAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '2:3'
  | '3:2'
  | '9:19.5'
  | '19.5:9'
  | '9:20'
  | '20:9'
  | '1:2'
  | '2:1'
  | 'auto'

/**
 * Resolution tiers for the grok-imagine image models.
 */
export type GrokImagineResolution = '1k' | '2k'

/**
 * Size strings for grok-imagine image models. The Imagine API is
 * aspect-ratio based rather than pixel-size based; like Gemini's native
 * image models, the generic `size` option uses an
 * `aspectRatio_resolution` template ("16:9_2k") — the resolution suffix is
 * optional ("16:9" uses the API default of 1k).
 */
export type GrokImagineImageSize =
  | GrokImagineAspectRatio
  | `${GrokImagineAspectRatio}_${GrokImagineResolution}`

const GROK_IMAGINE_ASPECT_RATIOS: ReadonlyArray<string> = [
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '2:3',
  '3:2',
  '9:19.5',
  '19.5:9',
  '9:20',
  '20:9',
  '1:2',
  '2:1',
  'auto',
]

const GROK_IMAGINE_RESOLUTIONS: ReadonlyArray<string> = ['1k', '2k']

/**
 * Models served by xAI's Imagine API. They are aspect-ratio sized and
 * support image-conditioned generation via `/v1/images/edits`; the legacy
 * grok-2-image-1212 model is pixel-sized and text-to-image only.
 */
export function isGrokImagineImageModel(model: string): boolean {
  return model.startsWith('grok-imagine-image')
}

/**
 * Parses a grok-imagine size string into its components.
 * Format: "aspectRatio" or "aspectRatio_resolution",
 * e.g. "16:9_2k" → { aspectRatio: "16:9", resolution: "2k" }.
 * Returns undefined when the string doesn't match the template.
 */
export function parseGrokImagineSize(
  size: string,
): { aspectRatio: string; resolution?: string } | undefined {
  const match = size.match(/^([\d.]+:[\d.]+|auto)(?:_(.+))?$/)
  const [, aspectRatio, resolution] = match ?? []
  if (aspectRatio === undefined) return undefined
  return { aspectRatio, ...(resolution !== undefined && { resolution }) }
}

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
 * Provider options for the grok-imagine image models (generation and
 * image-conditioned editing via xAI's Imagine API).
 */
export interface GrokImagineImageProviderOptions extends GrokImageBaseProviderOptions {
  /**
   * The format in which generated images are returned.
   * @default 'url'
   */
  response_format?: 'url' | 'b64_json'

  /**
   * Output resolution.
   * @default '1k'
   */
  resolution?: '1k' | '2k'

  /**
   * Processing tier for the request.
   * @default 'default'
   */
  service_tier?: 'default' | 'priority'
}

/**
 * Type-only map from model name to its specific provider options.
 */
export type GrokImageModelProviderOptionsByName = {
  'grok-2-image-1212': GrokImageProviderOptions
  'grok-imagine-image': GrokImagineImageProviderOptions
  'grok-imagine-image-quality': GrokImagineImageProviderOptions
}

/**
 * Type-only map from model name to its supported sizes.
 */
export type GrokImageModelSizeByName = {
  'grok-2-image-1212': GrokImageSize
  'grok-imagine-image': GrokImagineImageSize
  'grok-imagine-image-quality': GrokImagineImageSize
}

/**
 * Per-model prompt input modalities. Imagine API models accept image parts
 * in the prompt (routed to `/v1/images/edits`, up to 3 images, addressed by
 * xAI in request order); grok-2-image is text-to-image only.
 */
export type GrokImageModelInputModalitiesByName = {
  'grok-2-image-1212': readonly []
  'grok-imagine-image': readonly ['image']
  'grok-imagine-image-quality': readonly ['image']
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

  if (isGrokImagineImageModel(model)) {
    const parsed = parseGrokImagineSize(size)
    if (
      !parsed ||
      !GROK_IMAGINE_ASPECT_RATIOS.includes(parsed.aspectRatio) ||
      (parsed.resolution !== undefined &&
        !GROK_IMAGINE_RESOLUTIONS.includes(parsed.resolution))
    ) {
      throw new Error(
        `Size "${size}" is not supported by model "${model}". ` +
          `Expected an aspect ratio (${GROK_IMAGINE_ASPECT_RATIOS.join(', ')}) ` +
          `optionally suffixed with a resolution ("16:9_2k"; resolutions: ${GROK_IMAGINE_RESOLUTIONS.join(', ')}).`,
      )
    }
    return
  }

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
