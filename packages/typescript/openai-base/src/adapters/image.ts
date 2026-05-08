import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { createOpenAICompatibleClient } from '../utils/client'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAICompatibleClientConfig } from '../types/config'

/**
 * OpenAI-Compatible Image Generation Adapter
 *
 * A generalized base class for providers that implement OpenAI-compatible image
 * generation APIs. Providers like OpenAI, Grok, and others can extend this class
 * and only need to:
 * - Set `baseURL` in the config
 * - Lock the generic type parameters to provider-specific types
 * - Override validation or request building methods for provider-specific constraints
 *
 * All methods that validate inputs, build requests, or transform responses are
 * `protected` so subclasses can override them.
 */
export class OpenAICompatibleImageAdapter<
  TModel extends string,
  TProviderOptions extends object = Record<string, any>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>,
  TModelSizeByName extends Record<string, string> = Record<string, string>,
> extends BaseImageAdapter<
  TModel,
  TProviderOptions,
  TModelProviderOptionsByName,
  TModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name: string

  protected client: OpenAI_SDK

  constructor(
    config: OpenAICompatibleClientConfig,
    model: TModel,
    name: string = 'openai-compatible',
  ) {
    super(model, {})
    this.name = name
    this.client = createOpenAICompatibleClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<TProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size } = options

    // Validate inputs
    this.validatePrompt({ prompt, model })
    this.validateImageSize(model, size)
    this.validateNumberOfImages(model, numberOfImages)

    // Build request based on model type
    const request = this.buildRequest(options)

    try {
      options.logger.request(
        `activity=image provider=${this.name} model=${model} n=${request.n ?? 1} size=${request.size ?? 'default'}`,
        { provider: this.name, model },
      )
      const response = await this.client.images.generate({
        ...request,
        stream: false,
      })

      return this.transformResponse(model, response)
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

  protected buildRequest(
    options: ImageGenerationOptions<TProviderOptions>,
  ): OpenAI_SDK.Images.ImageGenerateParams {
    const { model, prompt, numberOfImages, size, modelOptions } = options

    return {
      model,
      prompt,
      n: numberOfImages ?? 1,
      size: size as OpenAI_SDK.Images.ImageGenerateParams['size'],
      ...modelOptions,
    }
  }

  protected transformResponse(
    model: string,
    response: OpenAI_SDK.Images.ImagesResponse,
  ): ImageGenerationResult {
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
  }

  protected validatePrompt(options: { prompt: string; model: string }): void {
    if (options.prompt.length === 0) {
      throw new Error('Prompt cannot be empty.')
    }
  }

  protected validateImageSize(_model: string, _size: string | undefined): void {
    // Default: no size validation — subclasses can override
  }

  protected validateNumberOfImages(
    _model: string,
    numberOfImages: number | undefined,
  ): void {
    if (numberOfImages === undefined) return

    // The base adapter only enforces "must be at least 1". Per-provider /
    // per-model upper bounds vary widely (some support 4, some 10, some
    // unlimited), so concrete adapter subclasses are expected to override
    // this method with a model-specific cap.
    if (numberOfImages < 1) {
      throw new Error(
        `Number of images must be at least 1. Requested: ${numberOfImages}`,
      )
    }
  }
}
