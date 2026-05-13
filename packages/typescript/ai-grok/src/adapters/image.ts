import OpenAI from 'openai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
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
import type { GrokImageModel } from '../model-meta'
import type {
  GrokImageModelProviderOptionsByName,
  GrokImageModelSizeByName,
  GrokImageProviderOptions,
} from '../image/image-provider-options'
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
export class GrokImageAdapter<
  TModel extends GrokImageModel,
> extends BaseImageAdapter<
  TModel,
  GrokImageProviderOptions,
  GrokImageModelProviderOptionsByName,
  GrokImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'grok' as const

  protected client: OpenAI

  constructor(config: GrokImageConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(withGrokDefaults(config))
  }

  async generateImages(
    options: ImageGenerationOptions<GrokImageProviderOptions>,
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
      options.logger.errors(`${this.name}.generateImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateImages failed`),
        source: `${this.name}.generateImages`,
      })
      throw error
    }
  }
}

/**
 * Creates a Grok image adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'grok-2-image-1212')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok image adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGrokImage('grok-2-image-1212', "xai-...");
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createGrokImage<TModel extends GrokImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokImageConfig, 'apiKey'>,
): GrokImageAdapter<TModel> {
  return new GrokImageAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Grok image adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-2-image-1212')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok image adapter instance with resolved types
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokImage('grok-2-image-1212');
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function grokImage<TModel extends GrokImageModel>(
  model: TModel,
  config?: Omit<GrokImageConfig, 'apiKey'>,
): GrokImageAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokImage(model, apiKey, config)
}
