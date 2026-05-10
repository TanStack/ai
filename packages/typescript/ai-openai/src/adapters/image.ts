import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils/client'
import { imagePartToUploadable } from '../utils/image-input'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type { OpenAIImageModel } from '../model-meta'
import type {
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName,
  OpenAIImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePart,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { Uploadable } from 'openai'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Models that accept reference images via the OpenAI image-edit endpoint.
 * `dall-e-3` is excluded — it has no edit endpoint.
 */
const IMAGE_EDIT_MODELS = new Set<string>([
  'gpt-image-1',
  'gpt-image-1-mini',
  'dall-e-2',
])

/**
 * Configuration for OpenAI image adapter
 */
export interface OpenAIImageConfig extends OpenAIClientConfig {}

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

  private client: OpenAI_SDK

  constructor(config: OpenAIImageConfig, model: TModel) {
    super(model, {})
    this.client = createOpenAIClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size, inputImages, logger } = options

    logger.request(
      `activity=generateImage provider=openai model=${this.model}`,
      {
        provider: 'openai',
        model: this.model,
      },
    )

    try {
      // Validate inputs
      validatePrompt({ prompt, model })
      validateImageSize(model, size)
      validateNumberOfImages(model, numberOfImages)

      if (inputImages && inputImages.length > 0) {
        if (!IMAGE_EDIT_MODELS.has(model)) {
          throw new Error(
            `OpenAI model "${model}" does not support image input. ` +
              `Use one of: ${[...IMAGE_EDIT_MODELS].join(', ')}.`,
          )
        }
        const editRequest = await this.buildEditRequest(options, inputImages)
        const response = await this.client.images.edit({
          ...editRequest,
          stream: false,
        })
        return this.transformResponse(model, response)
      }

      // Build request based on model type
      const request = this.buildRequest(options)

      const response = await this.client.images.generate({
        ...request,
        stream: false,
      })

      return this.transformResponse(model, response)
    } catch (error) {
      logger.errors('openai.generateImage fatal', {
        error,
        source: 'openai.generateImage',
      })
      throw error
    }
  }

  private async buildEditRequest(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>,
    inputImages: ReadonlyArray<ImagePart>,
  ): Promise<OpenAI_SDK.Images.ImageEditParamsNonStreaming> {
    const { model, prompt, numberOfImages, size, modelOptions } = options

    if (model === 'dall-e-2' && inputImages.length > 1) {
      throw new Error(
        'dall-e-2 only accepts a single reference image; received ' +
          `${inputImages.length}.`,
      )
    }

    const uploads = await Promise.all(
      inputImages.map((part, index) => imagePartToUploadable(part, index)),
    )
    const image: Uploadable | Array<Uploadable> =
      uploads.length === 1 ? uploads[0]! : uploads

    // The shared OpenAIImageProviderOptions union mixes fields from
    // generate-only models (e.g. dall-e-3 quality "hd") that aren't valid on
    // edit. The runtime guard above already rejected those models — cast here
    // so TS doesn't reject the wider union.
    return {
      ...modelOptions,
      model,
      prompt,
      image,
      n: numberOfImages ?? 1,
      size: size as OpenAI_SDK.Images.ImageEditParamsNonStreaming['size'],
      stream: false,
    } as OpenAI_SDK.Images.ImageEditParamsNonStreaming
  }

  private buildRequest(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>,
  ): OpenAI_SDK.Images.ImageGenerateParams {
    const { model, prompt, numberOfImages, size, modelOptions } = options

    // Spread modelOptions FIRST so explicit args (model, prompt, n, size) win
    // and user-supplied modelOptions cannot silently override them.
    return {
      ...modelOptions,
      model,
      prompt,
      n: numberOfImages ?? 1,
      size: size as OpenAI_SDK.Images.ImageGenerateParams['size'],
    }
  }

  private transformResponse(
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
}

/**
 * Creates an OpenAI image adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'dall-e-3', 'gpt-image-1')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI image adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiImage('dall-e-3', "sk-...");
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createOpenaiImage<TModel extends OpenAIImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter<TModel> {
  return new OpenAIImageAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI image adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'dall-e-3', 'gpt-image-1')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI image adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiImage('dall-e-3');
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function openaiImage<TModel extends OpenAIImageModel>(
  model: TModel,
  config?: Omit<OpenAIImageConfig, 'apiKey'>,
): OpenAIImageAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiImage(model, apiKey, config)
}
