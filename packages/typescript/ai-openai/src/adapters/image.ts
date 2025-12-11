import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { OPENAI_IMAGE_MODELS } from '../model-meta'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type {
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName,
  OpenAIImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIClientConfig } from '../utils'

/**
 * Configuration for OpenAI image adapter
 */
export interface OpenAIImageConfig extends OpenAIClientConfig { }

/**
 * OpenAI Image Generation Adapter
 *
 * Tree-shakeable adapter for OpenAI image generation functionality.
 * Supports gpt-image-1, gpt-image-1-mini, dall-e-3, and dall-e-2 models.
 *
 * Features:
 * - Model-specific type-safe provider options
 * - Size validation per model
 * - Number of images validation
 */
export class OpenAIImageAdapter extends BaseImageAdapter<
  typeof OPENAI_IMAGE_MODELS,
  OpenAIImageProviderOptions,
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'openai' as const
  readonly models = OPENAI_IMAGE_MODELS

  private client: OpenAI_SDK

  constructor(config: OpenAIImageConfig) {
    super({})
    this.client = createOpenAIClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size } = options

    // Validate inputs
    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

    // Build request based on model type
    const request = this.buildRequest(options)

    const response = await this.client.images.generate({
      ...request,
      stream: false,
    })

    return this.transformResponse(model, response)
  }

  private buildRequest(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>
  ): OpenAI_SDK.Images.ImageGenerateParams {
    const { model, prompt, numberOfImages, size, providerOptions } = options

    return {
      model,
      prompt,
      n: numberOfImages ?? 1,
      size: size as OpenAI_SDK.Images.ImageGenerateParams['size'],
      ...providerOptions,
    }
  }

  private transformResponse(
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
}

/**
 * Creates an OpenAI image adapter with explicit API key
 *
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI image adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiImage("sk-...");
 *
 * const result = await ai({
 *   adapter,
 *   model: 'gpt-image-1',
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createOpenaiImage(
  apiKey: string,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter {
  return new OpenAIImageAdapter({ apiKey, ...config })
}

/**
 * Creates an OpenAI image adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI image adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiImage();
 *
 * const result = await ai({
 *   adapter,
 *   model: 'dall-e-3',
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function openaiImage(
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiImage(apiKey, config)
}
