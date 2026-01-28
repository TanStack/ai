import { fal } from '@fal-ai/client'
import { BaseImageAdapter } from '@tanstack/ai/adapters'

import { FalImageSchemaMap } from '../generated'
import { configureFalClient, generateId as utilGenerateId } from '../utils'

import type { OutputType, Result } from '@fal-ai/client'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type { FalImageProviderOptions } from '../model-meta'
import type { FalImageInput, FalImageModel, FalImageOutput } from '../generated'

import type { FalClientConfig } from '../utils'
import type { z } from 'zod'

/** Map common size strings to fal.ai image_size presets */
const SIZE_TO_PRESET: Record<string, string> = {
  '1024x1024': 'square_hd',
  '512x512': 'square',
  '1024x768': 'landscape_4_3',
  '768x1024': 'portrait_4_3',
  '1280x720': 'landscape_16_9',
  '720x1280': 'portrait_16_9',
  '1920x1080': 'landscape_16_9',
  '1080x1920': 'portrait_16_9',
  '2560x1440': 'landscape_16_9',
  '1440x2560': 'portrait_16_9',
  '3840x2160': 'landscape_16_9',
  '2160x3840': 'portrait_16_9',
  '4096x2160': 'landscape_16_9',
  '2160x4096': 'portrait_16_9',
  '4320x2160': 'landscape_16_9',
  '2160x4320': 'portrait_16_9',
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
export class FalImageAdapter<
  TModel extends FalImageModel,
> extends BaseImageAdapter<
  TModel,
  FalImageProviderOptions<TModel>,
  Record<FalImageModel, FalImageProviderOptions<TModel>>,
  Record<FalImageModel, string>
> {
  readonly kind = 'image' as const
  readonly name = 'fal' as const
  readonly model: TModel
  readonly inputSchema: z.ZodSchema<FalImageInput<TModel>>
  readonly outputSchema: z.ZodSchema<FalImageOutput<TModel>>

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    this.model = model
    // The only reason we need to cast here, is because the number of image models is so large,
    // that typescript has a hard time inferring the type of the input and output schemas.
    // I had to type it as generic zod schemas.
    this.inputSchema = FalImageSchemaMap[model].input as z.ZodSchema<
      FalImageInput<TModel>
    >
    this.outputSchema = FalImageSchemaMap[model].output as z.ZodSchema<
      FalImageOutput<TModel>
    >

    configureFalClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<FalImageProviderOptions<TModel>>,
  ): Promise<ImageGenerationResult> {
    const { prompt, numberOfImages, size, modelOptions } = options
    const { width, height } = this.parseSize(size ?? '0x0')

    // Build the input object - spread modelOptions first, then override with standard options
    const input = this.inputSchema.parse({
      ...modelOptions,
      prompt,
      image_size: this.mapSizeToImageSize(size ?? '0x0', width, height),
      aspect_ratio: this.calculateAspectRatio(width, height),
      resolution: this.determineResolution(width, height),
      num_images: numberOfImages,
    })

    const result = await fal.subscribe(this.model, { input: input })

    return this.transformResponse(this.model, result)
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  /** Parse size string (WIDTHxHEIGHT) into width and height */
  private parseSize(size: string): {
    width: number | null
    height: number | null
  } {
    const match = size.match(/^(\d+)x(\d+)$/)
    return {
      width: match?.[1] ? parseInt(match[1], 10) : null,
      height: match?.[2] ? parseInt(match[2], 10) : null,
    }
  }

  /** Maps size to image_size field (preset or {width, height}) */
  private mapSizeToImageSize(
    size: string,
    width: number | null,
    height: number | null,
  ): string | { width: number; height: number } {
    const preset = SIZE_TO_PRESET[size]
    if (preset) return preset
    if (width && height) return { width, height }
    return size
  }

  /** Calculate aspect ratio from width and height */
  private calculateAspectRatio(
    width: number | null,
    height: number | null,
  ): string | null {
    if (!width || !height) return null

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    const divisor = gcd(width, height)
    return `${width / divisor}:${height / divisor}`
  }

  /** Determine resolution string from dimensions */
  private determineResolution(
    width: number | null,
    height: number | null,
  ): string | null {
    if (!width || !height) return null

    const maxDimension = Math.max(width, height)

    if (maxDimension >= 3840) return '4k'
    if (maxDimension >= 2560) return '2k'
    if (maxDimension >= 1920) return '1k'
    if (maxDimension >= 1080) return '1080p'
    if (maxDimension >= 720) return '720p'
    if (maxDimension >= 580) return '580p'
    if (maxDimension >= 540) return '540p'
    if (maxDimension >= 480) return '480p'
    if (maxDimension >= 360) return '360p'

    return null
  }

  private transformResponse(
    model: string,
    response: Result<OutputType<TModel>>,
  ): ImageGenerationResult {
    const data = response.data
    let images: Array<GeneratedImage> = []

    if ('images' in data && Array.isArray(data.images)) {
      images = data.images.map((img: any) => this.parseImage(img))
    } else if (
      'image' in data &&
      data.image &&
      typeof data.image === 'object'
    ) {
      images = [this.parseImage(data.image)]
    }

    return {
      id: response.requestId || this.generateId(),
      model,
      images,
    }
  }

  private parseImage(img: { url: string }): GeneratedImage {
    const { url } = img
    const base64Match = url.match(/^data:image\/[^;]+;base64,(.+)$/)
    if (base64Match) {
      return { b64Json: base64Match[1], url }
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
export function createFalImage<TModel extends FalImageModel>(
  model: TModel,
  config?: FalClientConfig,
): FalImageAdapter<TModel> {
  return new FalImageAdapter(model, config)
}

/**
 * Create a fal.ai image adapter using config.apiKey or the FAL_KEY environment variable.
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
export function falImage<TModel extends FalImageModel>(
  model: TModel,
  config?: FalClientConfig,
): FalImageAdapter<TModel> {
  return createFalImage(model, config)
}
