import { fal } from '@fal-ai/client'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  configureFalClient,
  getFalApiKeyFromEnv,
  generateId as utilGenerateId,
} from '../utils'
import type { FalClientConfig } from '../utils'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type {
  FalImageProviderOptions,
  FalModel,
  FalModelOutput,
} from '../model-meta'

export interface FalImageConfig extends Omit<FalClientConfig, 'apiKey'> {
  apiKey?: string
}

/**
 * fal.ai image generation adapter with full type inference.
 *
 * Uses fal.ai's comprehensive type system to provide autocomplete
 *
 * and type safety for all 600+ supported models.
 *
 * @example
 * ```typescript
 * const adapter = falImage('fal-ai/flux/dev')
 * const result = await adapter.generateImages({
 *   model: 'fal-ai/flux/dev',
 *   prompt: 'a cat',
 *   modelOptions: {
 *     num_inference_steps: 28, // Type-safe! Autocomplete works
 *     guidance_scale: 3.5,
 *   },
 * })
 * ```
 */
export class FalImageAdapter<TModel extends FalModel> extends BaseImageAdapter<
  TModel,
  FalImageProviderOptions<TModel>,
  Record<string, FalImageProviderOptions<TModel>>,
  Record<string, string>
> {
  readonly kind = 'image' as const
  readonly name = 'fal' as const

  constructor(apiKey: string, model: TModel, config?: FalImageConfig) {
    super({}, model)
    configureFalClient({ apiKey, proxyUrl: config?.proxyUrl })
  }

  async generateImages(
    options: ImageGenerationOptions<FalImageProviderOptions<TModel>>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size, modelOptions } = options

    // Build the input object - spread modelOptions first, then override with standard options
    const input: Record<string, unknown> = {
      ...(modelOptions as Record<string, unknown>),
      prompt,
    }

    // Map size to fal.ai format if provided
    if (size) {
      input.image_size = this.mapSizeToFalFormat(size)
    }

    // Add number of images if specified
    if (numberOfImages) {
      input.num_images = numberOfImages
    }

    const result = await fal.subscribe(model, { input })

    return this.transformResponse(
      model,
      result as { data: FalModelOutput<TModel>; requestId: string },
    )
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  /**
   * Maps TanStack AI size format (WIDTHxHEIGHT) to fal.ai format.
   * fal.ai accepts either preset names or { width, height } objects.
   */
  private mapSizeToFalFormat(
    size: string,
  ): string | { width: number; height: number } {
    const SIZE_TO_FAL_PRESET: Record<string, string> = {
      '1024x1024': 'square_hd',
      '512x512': 'square',
      '1024x768': 'landscape_4_3',
      '768x1024': 'portrait_4_3',
      '1280x720': 'landscape_16_9',
      '720x1280': 'portrait_16_9',
      '1920x1080': 'landscape_16_9',
      '1080x1920': 'portrait_16_9',
    }

    // Check if it's a known preset mapping
    const preset = SIZE_TO_FAL_PRESET[size]
    if (preset) return preset

    // Try to parse as WIDTHxHEIGHT
    const match = size.match(/^(\d+)x(\d+)$/)
    if (match && match[1] && match[2]) {
      return {
        width: parseInt(match[1], 10),
        height: parseInt(match[2], 10),
      }
    }

    // Return as-is if it's already a preset name
    return size
  }

  private transformResponse(
    model: string,
    response: { data: FalModelOutput<TModel>; requestId: string },
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = []
    const data = response.data as Record<string, unknown>

    // Handle array of images (most models return { images: [...] })
    if ('images' in data && Array.isArray(data.images)) {
      for (const img of data.images as Array<{ url: string }>) {
        images.push(this.parseImage(img))
      }
    }
    // Handle single image response (some models return { image: {...} })
    else if ('image' in data && data.image && typeof data.image === 'object') {
      images.push(this.parseImage(data.image as { url: string }))
    }

    return {
      id: response.requestId || this.generateId(),
      model,
      images,
    }
  }

  private parseImage(img: { url: string }): GeneratedImage {
    const url = img.url
    // Check if it's a base64 data URL
    if (url.startsWith('data:')) {
      const base64Match = url.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match) {
        return {
          b64Json: base64Match[1],
          url,
        }
      }
    }
    return { url }
  }
}

/**
 * Create a fal.ai image adapter with an explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createFalImage('fal-ai/flux-pro/v1.1-ultra', process.env.FAL_KEY!)
 * ```
 */
export function createFalImage<TModel extends FalModel>(
  model: TModel,
  apiKey: string,
  config?: FalImageConfig,
): FalImageAdapter<TModel> {
  return new FalImageAdapter(apiKey, model, config)
}

/**
 * Create a fal.ai image adapter using the FAL_KEY environment variable.
 *
 * The model parameter accepts any fal.ai model ID with full type inference.
 * As you type, you'll get autocomplete for all 600+ supported models.
 *
 * @example
 * ```typescript
 * // Full autocomplete as you type the model name
 * const adapter = falImage('fal-ai/flux/dev')
 *
 * // modelOptions are type-safe based on the model
 * const result = await adapter.generateImages({
 *   model: 'fal-ai/flux/dev',
 *   prompt: 'a cat',
 *   modelOptions: {
 *     num_inference_steps: 28,
 *     guidance_scale: 3.5,
 *     seed: 12345,
 *   },
 * })
 * ```
 */
export function falImage<TModel extends FalModel>(
  model: TModel,
  config?: FalImageConfig,
): FalImageAdapter<TModel> {
  const apiKey = getFalApiKeyFromEnv()
  return createFalImage(model, apiKey, config)
}
