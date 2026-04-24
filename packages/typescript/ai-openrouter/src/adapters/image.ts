import { OpenRouter } from '@openrouter/sdk'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  getOpenRouterApiKeyFromEnv,
  generateId as utilGenerateId,
} from '../utils'
import type { OpenRouterClientConfig } from '../utils'
import type {
  OpenRouterImageModelProviderOptionsByName,
  OpenRouterImageModelSizeByName,
  OpenRouterImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type { OPENROUTER_IMAGE_MODELS } from '../model-meta'
import type { ChatResult } from '@openrouter/sdk/models'

export interface OpenRouterImageConfig extends OpenRouterClientConfig {}

export type OpenRouterImageModel = (typeof OPENROUTER_IMAGE_MODELS)[number]

/**
 * Mapping of standard image sizes to their aspect ratios
 * Used for Gemini and other models that support aspect ratio configuration
 */
const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  '1024x1024': '1:1', // default
  '832x1248': '2:3',
  '1248x832': '3:2',
  '864x1184': '3:4',
  '1184x864': '4:3',
  '896x1152': '4:5',
  '1152x896': '5:4',
  '768x1344': '9:16',
  '1344x768': '16:9',
  '1536x672': '21:9',
}

export class OpenRouterImageAdapter<
  TModel extends OpenRouterImageModel,
> extends BaseImageAdapter<
  TModel,
  OpenRouterImageProviderOptions,
  OpenRouterImageModelProviderOptionsByName,
  OpenRouterImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'openrouter' as const

  private client: OpenRouter

  constructor(config: OpenRouterImageConfig, model: TModel) {
    super(model, {})
    this.client = new OpenRouter({
      ...config,
      apiKey: config.apiKey,
      serverURL: config.baseURL,
    })
  }

  async generateImages(
    options: ImageGenerationOptions<OpenRouterImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size, modelOptions, logger } =
      options
    // Use provided aspect_ratio or derive from size
    const aspectRatio = size ? SIZE_TO_ASPECT_RATIO[size] : undefined

    logger.request(
      `activity=generateImage provider=openrouter model=${this.model}`,
      {
        provider: 'openrouter',
        model: this.model,
      },
    )

    const response = await this.client.chat.send({
      chatRequest: {
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        modalities: ['image'],
        stream: false,
        // OpenRouter filters out invalid config per provider specifications
        imageConfig: {
          ...(numberOfImages ? { numberOfImages } : {}),
          ...(aspectRatio
            ? {
                aspect_ratio: aspectRatio,
              }
            : {}),
          ...(modelOptions?.image_size
            ? {
                image_size: modelOptions.image_size,
              }
            : {}),
        },
      },
    })

    // Check for error in response
    if ('error' in response && response.error) {
      const { error } = response
      const errorMsg =
        typeof error === 'object' && 'message' in error
          ? String(error.message)
          : String(error)
      throw new Error(`Image generation failed: ${errorMsg}`)
    }

    return this.transformResponse(model, response)
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private transformResponse(
    model: string,
    response: ChatResult,
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = []

    for (const choice of response.choices) {
      const choiceImages = choice.message.images
      if (choiceImages) {
        for (const img of choiceImages) {
          if (typeof img.imageUrl.url !== 'string') {
            continue
          }
          const url = img.imageUrl.url
          if (url.startsWith('data:')) {
            const base64Match = url.match(/^data:image\/[^;]+;base64,(.+)$/)
            if (base64Match && base64Match[1]) {
              images.push({ b64Json: base64Match[1] })
            } else {
              images.push({ url })
            }
          } else {
            images.push({ url })
          }
        }
      }
    }

    if (images.length === 0) {
      throw new Error('Image generation failed: response contained no images')
    }

    return {
      id: response.id || this.generateId(),
      model: response.model || model,
      images,
    }
  }
}

export function createOpenRouterImage<TModel extends OpenRouterImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenRouterImageConfig, 'apiKey'>,
): OpenRouterImageAdapter<TModel> {
  return new OpenRouterImageAdapter({ apiKey, ...config }, model)
}

export function openRouterImage<TModel extends OpenRouterImageModel>(
  model: TModel,
  config?: Omit<OpenRouterImageConfig, 'apiKey'>,
): OpenRouterImageAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterImage(model, apiKey, config)
}
