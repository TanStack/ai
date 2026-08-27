import OpenAI from 'openai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { buildImagesUsage } from '@tanstack/openai-base'
import { generateId } from '@tanstack/ai-utils'
import {
  getVercelGatewayApiKeyFromEnv,
  withVercelGatewayDefaults,
} from '../utils/client'
import { mapGatewayModelOptions } from '../utils/map-gateway-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  VercelGatewayImageModel,
  VercelGatewayImageModelInputModalitiesByName,
  VercelGatewayImageModelProviderOptionsByName,
  VercelGatewayImageModelSizeByName,
} from '../model-meta'
import type { VercelGatewayImageProviderOptions } from '../image/image-provider-options'
import type { VercelGatewayClientConfig } from '../utils/client'

export interface VercelGatewayImageConfig extends VercelGatewayClientConfig {}

export class VercelGatewayImageAdapter<
  TModel extends VercelGatewayImageModel,
> extends BaseImageAdapter<
  TModel,
  VercelGatewayImageProviderOptions,
  VercelGatewayImageModelProviderOptionsByName,
  VercelGatewayImageModelSizeByName,
  VercelGatewayImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'vercel-gateway' as const

  protected client: OpenAI

  constructor(config: VercelGatewayImageConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withVercelGatewayDefaults(config))
  }

  async generateImages(
    options: ImageGenerationOptions<VercelGatewayImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, numberOfImages, size, logger } = options
    const resolved = resolveMediaPrompt(options.prompt)
    const prompt = resolved.text

    if (resolved.videos.length > 0) {
      throw new Error(
        `${this.name}.generateImages does not support video prompt parts (model: ${model}).`,
      )
    }
    if (resolved.audios.length > 0) {
      throw new Error(
        `${this.name}.generateImages does not support audio prompt parts (model: ${model}).`,
      )
    }
    if (resolved.images.length > 0) {
      throw new Error(
        `${this.name}.generateImages does not support image edits in v1 (model: ${model}).`,
      )
    }

    const mapped = mapGatewayModelOptions(
      options.modelOptions as Record<string, unknown> | undefined,
    )
    const request: OpenAI_SDK.Images.ImageGenerateParams = {
      ...mapped,
      model,
      prompt,
      n: numberOfImages ?? 1,
    }
    if (size !== undefined) {
      request.size = size
    }

    try {
      logger.request(
        `activity=image provider=${this.name} model=${model} n=${request.n ?? 1} size=${request.size ?? 'default'}`,
        { provider: this.name, model },
      )
      const response = await this.client.images.generate({
        ...request,
        stream: false,
      })

      const images: Array<GeneratedImage> = (response.data ?? []).flatMap(
        (item): Array<GeneratedImage> => {
          const revisedPromptField =
            item.revised_prompt !== undefined
              ? { revisedPrompt: item.revised_prompt }
              : {}
          if (item.b64_json) {
            return [{ b64Json: item.b64_json, ...revisedPromptField }]
          }
          if (item.url) {
            return [{ url: item.url, ...revisedPromptField }]
          }
          return []
        },
      )

      if (images.length === 0) {
        throw new Error(`${this.name}: image response contained no images`)
      }

      const usage = buildImagesUsage(response.usage)

      return {
        id: generateId(this.name),
        model,
        images,
        ...(usage ? { usage } : {}),
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.generateImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateImages failed`),
        source: `${this.name}.generateImages`,
      })
      throw error
    }
  }
}

export function createVercelGatewayImage<
  TModel extends VercelGatewayImageModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<VercelGatewayImageConfig, 'apiKey'>,
): VercelGatewayImageAdapter<TModel> {
  return new VercelGatewayImageAdapter({ apiKey, ...config }, model)
}

export function vercelGatewayImage<TModel extends VercelGatewayImageModel>(
  model: TModel,
  config?: Omit<VercelGatewayImageConfig, 'apiKey'>,
): VercelGatewayImageAdapter<TModel> {
  return createVercelGatewayImage(
    model,
    getVercelGatewayApiKeyFromEnv(),
    config,
  )
}
