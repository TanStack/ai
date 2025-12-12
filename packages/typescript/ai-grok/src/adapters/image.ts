import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { GROK_IMAGE_MODELS } from '../model-meta'
import { createGrokClient, generateId, getGrokApiKeyFromEnv } from '../utils'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type {
  GrokImageModelProviderOptionsByName,
  GrokImageModelSizeByName,
  GrokImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { GrokClientConfig } from '../utils'

/**
 * Configuration for Grok image adapter
 */
export interface GrokImageConfig extends GrokClientConfig {}

/**
 * Grok Image Generation Adapter
 *
 * Tree-shakeable adapter for Grok image generation functionality.
 * Supports grok-2-image-1212 model.
 *
 * Features:
 * - Model-specific type-safe provider options
 * - Size validation per model
 * - Number of images validation
 */
export class GrokImageAdapter extends BaseImageAdapter<
  typeof GROK_IMAGE_MODELS,
  GrokImageProviderOptions,
  GrokImageModelProviderOptionsByName,
  GrokImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'grok' as const
  readonly models = GROK_IMAGE_MODELS

  private client: OpenAI_SDK

  constructor(config: GrokImageConfig) {
    super({})
    this.client = createGrokClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<GrokImageProviderOptions>,
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
    options: ImageGenerationOptions<GrokImageProviderOptions>,
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
 * Creates a Grok image adapter with explicit API key
 *
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok image adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGrokImage("xai-...");
 *
 * const result = await ai({
 *   adapter,
 *   model: 'grok-2-image-1212',
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createGrokImage(
  apiKey: string,
  config?: Omit<GrokImageConfig, 'apiKey'>,
): GrokImageAdapter {
  return new GrokImageAdapter({ apiKey, ...config })
}

/**
 * Creates a Grok image adapter with automatic API key detection from environment variables.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok image adapter instance
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokImage();
 *
 * const result = await ai({
 *   adapter,
 *   model: 'grok-2-image-1212',
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function grokImage(
  config?: Omit<GrokImageConfig, 'apiKey'>,
): GrokImageAdapter {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokImage(apiKey, config)
}
