import { BaseImageAdapter } from '@tanstack/ai/adapters'
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
    super({}, model)
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

    const response = await this.client.images.generate({
      ...request,
      stream: false,
    })

    return this.transformResponse(model, response)
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
    const images: Array<GeneratedImage> = (response.data ?? []).map((item) => ({
      b64Json: item.b64_json,
      url: item.url,
      revisedPrompt: item.revised_prompt,
    }))

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

    if (numberOfImages < 1 || numberOfImages > 10) {
      throw new Error(
        `Number of images must be between 1 and 10. Requested: ${numberOfImages}`,
      )
    }
  }
}
