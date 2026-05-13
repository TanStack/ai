import OpenAI from 'openai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIImageModel } from '../model-meta'
import type {
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName,
  OpenAIImageProviderOptions,
} from '../image/image-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI image adapter
 */
export interface OpenAIImageConfig extends OpenAIClientConfig {}

/**
 * OpenAI Image Generation Adapter
 *
 * Tree-shakeable adapter for OpenAI image generation functionality.
 * Supports gpt-image-1, gpt-image-1-mini, dall-e-3, and dall-e-2 models.
 */
export class OpenAIImageAdapter<
  TModel extends OpenAIImageModel,
> extends BaseImageAdapter<
  TModel,
  OpenAIImageProviderOptions,
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAIImageConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(config)
  }

  async generateImages(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size, modelOptions } = options

    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

    const request: OpenAI_SDK.Images.ImageGenerateParams = {
      model,
      prompt,
      n: numberOfImages ?? 1,
      size: size as OpenAI_SDK.Images.ImageGenerateParams['size'],
      ...modelOptions,
    }

    try {
      options.logger.request(
        `activity=image provider=${this.name} model=${model} n=${request.n ?? 1} size=${request.size ?? 'default'}`,
        { provider: this.name, model },
      )
      const response = await this.client.images.generate({
        ...request,
        stream: false,
      })

      const images: Array<GeneratedImage> = (response.data ?? []).flatMap(
        (item): Array<GeneratedImage> => {
          const revisedPrompt = item.revised_prompt
          if (item.b64_json) {
            return [{ b64Json: item.b64_json, revisedPrompt }]
          }
          if (item.url) {
            return [{ url: item.url, revisedPrompt }]
          }
          return []
        },
      )

      return {
        id: generateId(this.name),
        model,
        images,
        usage: response.usage
          ? {
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      options.logger.errors(`${this.name}.generateImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateImages failed`),
        source: `${this.name}.generateImages`,
      })
      throw error
    }
  }
}

export function createOpenaiImage<TModel extends OpenAIImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter<TModel> {
  return new OpenAIImageAdapter({ apiKey, ...config }, model)
}

export function openaiImage<TModel extends OpenAIImageModel>(
  model: TModel,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiImage(model, apiKey, config)
}
