import { OpenRouter } from '@openrouter/sdk'
import {
  isFileSource,
  resolveMediaPrompt,
  unsupportedFileSourceError,
} from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  getOpenRouterApiKeyFromEnv,
  generateId as utilGenerateId,
} from '../utils/client'
import { buildOpenRouterUsage } from '../usage'
import { extractUsageCost } from './cost'
import type { OpenRouterClientConfig } from '../utils/client'
import type {
  OpenRouterImageModelInputModalitiesByName,
  OpenRouterImageModelProviderOptionsByName,
  OpenRouterImageModelSizeByName,
  OpenRouterImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePart,
  MediaInputMetadata,
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

/**
 * Convert a TanStack ImagePart into the URL string accepted by OpenRouter's
 * `image_url` content parts: public URLs pass through, data sources become
 * base64 data URIs.
 */
function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
  if (isFileSource(part.source)) throw unsupportedFileSourceError('openrouter')
  if (part.source.type === 'url') return part.source.value
  return `data:${part.source.mimeType};base64,${part.source.value}`
}

export class OpenRouterImageAdapter<
  TModel extends OpenRouterImageModel,
> extends BaseImageAdapter<
  TModel,
  OpenRouterImageProviderOptions,
  OpenRouterImageModelProviderOptionsByName,
  OpenRouterImageModelSizeByName,
  OpenRouterImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'openrouter' as const

  private readonly client: OpenRouter

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
    const resolved = resolveMediaPrompt(options.prompt)

    if (resolved.videos.length > 0 || resolved.audios.length > 0) {
      throw new Error(
        `openrouter.generateImages does not support video / audio prompt parts on model ${this.model}.`,
      )
    }

    const { model, numberOfImages, size, modelOptions, logger } = options
    // Use provided aspect_ratio or derive from size
    const aspectRatio = size ? SIZE_TO_ASPECT_RATIO[size] : undefined

    // Image-conditioned generation: map the prompt parts 1:1 onto
    // chat-completions content parts, preserving the interleaved order —
    // OpenRouter forwards them to the underlying image model (e.g. Gemini
    // image models), where position is meaningful. Role hints carry no
    // per-field semantics on this pathway.
    type ContentItem =
      | { type: 'text'; text: string }
      | { type: 'image_url'; imageUrl: { url: string } }
    const content =
      resolved.images.length > 0
        ? resolved.parts.flatMap((part): Array<ContentItem> => {
            if (part.type === 'text') {
              return [{ type: 'text', text: part.content }]
            }
            if (part.type === 'image') {
              return [
                { type: 'image_url', imageUrl: { url: imagePartToUrl(part) } },
              ]
            }
            // Video / audio parts were rejected above.
            return []
          })
        : resolved.text

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
            content,
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

    // OpenRouter routes image generation through the chat surface, so the
    // response carries the same `usage` shape as text. Surface it (with any
    // detail breakdowns and provider-reported cost) when present.
    const baseUsage = buildOpenRouterUsage(response.usage)
    const usage = baseUsage && {
      ...baseUsage,
      ...extractUsageCost(response.usage),
    }

    return {
      id: response.id || this.generateId(),
      model: response.model || model,
      images,
      ...(usage ? { usage } : {}),
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
