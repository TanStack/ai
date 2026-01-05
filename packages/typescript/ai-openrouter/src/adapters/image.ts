import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  buildHeaders,
  generateId,
  getOpenRouterApiKeyFromEnv,
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

export interface OpenRouterImageConfig extends OpenRouterClientConfig {}

export type OpenRouterImageModel = string

interface OpenRouterImageResponse {
  id?: string
  model?: string
  choices?: Array<{
    message?: {
      content?: string
      images?: Array<{
        image_url: {
          url: string
        }
      }>
    }
  }>
  error?: {
    message: string
    code?: string
  }
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

  private openRouterConfig: OpenRouterImageConfig
  private baseURL: string

  constructor(config: OpenRouterImageConfig, model: TModel) {
    super({}, model)
    this.openRouterConfig = config
    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1'
  }

  async generateImages(
    options: ImageGenerationOptions<OpenRouterImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages = 1, size, modelOptions } = options

    const aspectRatio = modelOptions?.aspect_ratio || this.sizeToAspectRatio(size)

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      modalities: ['image', 'text'],
      n: numberOfImages,
      ...(aspectRatio && {
        image_config: {
          aspect_ratio: aspectRatio,
        },
      }),
    }

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(this.openRouterConfig),
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage: string
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error?.message || `HTTP ${response.status}: ${response.statusText}`
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(`Image generation failed: ${errorMessage}`)
    }

    const data: OpenRouterImageResponse = await response.json()

    if (data.error) {
      throw new Error(`Image generation failed: ${data.error.message}`)
    }

    return this.transformResponse(model, data)
  }

  private sizeToAspectRatio(size?: string): string | undefined {
    if (!size) return undefined

    const [width, height] = size.split('x').map(Number)
    if (!width || !height) return undefined

    const ratio = width / height
    if (Math.abs(ratio - 1) < 0.01) return '1:1'
    if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9'
    if (Math.abs(ratio - 9 / 16) < 0.01) return '9:16'
    if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3'
    if (Math.abs(ratio - 3 / 4) < 0.01) return '3:4'

    return `${width}:${height}`
  }

  private transformResponse(
    model: string,
    response: OpenRouterImageResponse,
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = []

    for (const choice of response.choices || []) {
      if (choice.message?.images) {
        for (const img of choice.message.images) {
          const url = img.image_url.url
          if (url.startsWith('data:')) {
            const base64Match = url.match(/^data:image\/[^;]+;base64,(.+)$/)
            if (base64Match) {
              images.push({
                b64Json: base64Match[1],
                url: url,
              })
            } else {
              images.push({ url })
            }
          } else {
            images.push({ url })
          }
        }
      }
    }

    return {
      id: response.id || generateId(this.name),
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

export function openrouterImage<TModel extends OpenRouterImageModel>(
  model: TModel,
  config?: Omit<OpenRouterImageConfig, 'apiKey'>,
): OpenRouterImageAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterImage(model, apiKey, config)
}
