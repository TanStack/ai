import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { resolveMediaPrompt } from '@tanstack/ai'
import { resolveConfigFromEnv } from '../utils/config'
import { outputToBase64, runModel } from '../utils/run'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type { CloudflareConfig, CloudflareConfigInput } from '../utils/config'
import type { CloudflareImageModel } from '../utils/models'

/** Text-to-image inputs forwarded to the model (`steps`, `guidance`, ...). */
export interface CloudflareImageProviderOptions {
  negative_prompt?: string
  steps?: number
  num_steps?: number
  guidance?: number
  seed?: number
  [key: string]: unknown
}

/**
 * Cloudflare image adapter. Runs Workers AI text-to-image models and returns
 * base64 images, whether the model answers with `{ image }` JSON (Flux,
 * Leonardo) or raw PNG bytes (Stable Diffusion).
 */
export class CloudflareImageAdapter<
  TModel extends CloudflareImageModel,
> extends BaseImageAdapter<TModel, CloudflareImageProviderOptions> {
  readonly name = 'cloudflare' as const

  constructor(
    private readonly cfConfig: CloudflareConfig,
    model: TModel,
  ) {
    super(model, {})
  }

  async generateImages(
    options: ImageGenerationOptions<CloudflareImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, logger, numberOfImages = 1 } = options
    const prompt = resolveMediaPrompt(options.prompt)
    const [width, height] = options.size?.split('x').map(Number) ?? []
    const inputs = {
      ...(width && { width }),
      ...(height && { height }),
      ...options.modelOptions,
      prompt: prompt.text,
    }
    try {
      logger.request(
        `activity=image provider=${this.name} model=${model} n=${numberOfImages}`,
        { provider: this.name, model },
      )
      const images = await Promise.all(
        Array.from(
          { length: numberOfImages },
          async (): Promise<GeneratedImage> => {
            const output = await runModel(this.cfConfig, model, inputs, {
              signal: options.abortSignal,
            })
            const image =
              output && typeof output === 'object' && 'image' in output
                ? (output as { image: string }).image
                : await outputToBase64(output)
            return { b64Json: image }
          },
        ),
      )
      return { id: generateId(this.name), model, images }
    } catch (error: unknown) {
      logger.errors(`${this.name}.generateImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateImages failed`),
        source: `${this.name}.generateImages`,
      })
      throw error
    }
  }
}

export function createCloudflareImage<TModel extends CloudflareImageModel>(
  model: TModel,
  config: CloudflareConfig,
): CloudflareImageAdapter<TModel> {
  return new CloudflareImageAdapter(config, model)
}

export function cloudflareImage<TModel extends CloudflareImageModel>(
  model: TModel,
  config?: CloudflareConfigInput,
): CloudflareImageAdapter<TModel> {
  return new CloudflareImageAdapter(resolveConfigFromEnv(config), model)
}
