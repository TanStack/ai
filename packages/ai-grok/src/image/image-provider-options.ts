/**
 * Grok Image Generation Provider Options
 *
 * Provider-specific options for Grok image generation: the aspect-ratio
 * sized Imagine API models (grok-imagine-image, grok-imagine-image-2.0,
 * grok-imagine-image-quality).
 */

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
 * support image-conditioned generation via `/v1/images/edits`.
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
 * Provider options for grok-imagine-image-2.0, which adds a generation
 * `quality` knob on top of the shared Imagine options.
 */
export interface GrokImagineImage2ProviderOptions extends GrokImagineImageProviderOptions {
  /**
   * Generation quality. Only supported by grok-imagine-image-2.0.
   * @default 'medium'
   */
  quality?: 'low' | 'medium'
}

/**
 * Type-only map from model name to its specific provider options.
 */
export type GrokImageModelProviderOptionsByName = {
  'grok-imagine-image': GrokImagineImageProviderOptions
  'grok-imagine-image-2.0': GrokImagineImage2ProviderOptions
  'grok-imagine-image-quality': GrokImagineImageProviderOptions
}

/**
 * Type-only map from model name to its supported sizes.
 */
export type GrokImageModelSizeByName = {
  'grok-imagine-image': GrokImagineImageSize
  'grok-imagine-image-2.0': GrokImagineImageSize
  'grok-imagine-image-quality': GrokImagineImageSize
}

/**
 * Per-model prompt input modalities. Imagine API models accept image parts
 * in the prompt (routed to `/v1/images/edits`, up to 3 images, addressed by
 * xAI in request order).
 */
export type GrokImageModelInputModalitiesByName = {
  'grok-imagine-image': readonly ['image']
  'grok-imagine-image-2.0': readonly ['image']
  'grok-imagine-image-quality': readonly ['image']
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

  throw new Error(`Unknown image model: ${model}`)
}

/**
 * Validates that the number of images is within bounds for the model.
 */
export function validateNumberOfImages(
  _model: string,
  numberOfImages: number | undefined,
): void {
  if (numberOfImages === undefined) return

  // Imagine image models accept 1-10 images per request.
  if (numberOfImages < 1 || numberOfImages > 10) {
    throw new Error(
      `Number of images must be between 1 and 10. Requested: ${numberOfImages}`,
    )
  }
}

export const validatePrompt = (prompt: string) => {
  if (prompt.length === 0) {
    throw new Error('Prompt cannot be empty.')
  }
}
