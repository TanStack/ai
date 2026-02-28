import { fal } from '@fal-ai/client'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { configureFalClient, generateId as utilGenerateId } from '../utils'
import { mapSizeToFalFormat } from '../image/image-provider-options'
import type { OutputType, Result } from '@fal-ai/client'
import type { FalClientConfig } from '../utils'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type {
  FalImageProviderOptions,
  FalModel,
  FalModelImageSize,
  FalModelInput,
} from '../model-meta'

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
  Record<TModel, FalImageProviderOptions<TModel>>,
  Record<TModel, FalModelImageSize<TModel>>
> {
  readonly kind = 'image' as const
  readonly name = 'fal' as const

  constructor(model: TModel, config?: FalClientConfig) {
    super({}, model)
    configureFalClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<
      FalImageProviderOptions<TModel>,
      FalModelImageSize<TModel>
    >,
  ): Promise<ImageGenerationResult> {
    const input = this.buildInput(options)
    const result = await fal.subscribe(this.model, { input })
    return this.transformResponse(result)
  }

  private buildInput(
    options: ImageGenerationOptions<FalImageProviderOptions<TModel>, string>,
  ): FalModelInput<TModel> {
    const sizeParams = mapSizeToFalFormat(options.size)
    const input = {
      ...options.modelOptions,
      ...sizeParams,
      prompt: options.prompt,
      num_images: options.numberOfImages,
    } as FalModelInput<TModel>
    return input
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private transformResponse(
    response: Result<OutputType<TModel>>,
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = []
    const data = response.data

    // Handle array of images (most models return { images: [...] })
    if ('images' in data && Array.isArray(data.images)) {
      for (const img of data.images) {
        images.push(this.parseImage(img))
      }
    }
    // Handle single image response (some models return { image: {...} })
    else if ('image' in data && data.image && typeof data.image === 'object') {
      images.push(this.parseImage(data.image))
    }

    return {
      id: response.requestId || this.generateId(),
      model: this.model,
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

export function createFalImage<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalImageAdapter<TModel> {
  return new FalImageAdapter(model, config)
}

export function falImage<TModel extends FalModel>(
  model: TModel,
  config?: FalClientConfig,
): FalImageAdapter<TModel> {
  return createFalImage(model, config)
}
