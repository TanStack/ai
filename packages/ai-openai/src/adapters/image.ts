import OpenAI from 'openai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { buildImagesUsage } from '@tanstack/openai-base'
import { generateId } from '@tanstack/ai-utils'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import { imagePartToFile } from '../image/image-input-to-file'
import {
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePart,
  MediaInputMetadata,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIImageModel } from '../model-meta'
import type {
  OpenAIImageModelInputModalitiesByName,
  OpenAIImageModelProviderOptionsByName,
  OpenAIImageModelSizeByName,
  OpenAIImageProviderOptions,
} from '../image/image-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

// Per OpenAI docs: dall-e-2 accepts 1 image to `images.edit()`; the
// gpt-image models accept up to 16; dall-e-3 does not support edit at all.
const EDIT_MAX_IMAGES: Record<OpenAIImageModel, number> = {
  'dall-e-2': 1,
  'gpt-image-1': 16,
  'gpt-image-1-mini': 16,
  'gpt-image-2': 16,
  'dall-e-3': 0,
}

/**
 * Configuration for OpenAI image adapter
 */
export interface OpenAIImageConfig extends OpenAIClientConfig {}

/**
 * OpenAI Image Generation Adapter
 *
 * Tree-shakeable adapter for OpenAI image generation functionality.
 * Supports gpt-image-2, gpt-image-1, gpt-image-1-mini, dall-e-3, and dall-e-2 models.
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
  OpenAIImageModelSizeByName,
  OpenAIImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAIImageConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(config)
  }

  async generateImages(
    options: ImageGenerationOptions<OpenAIImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, numberOfImages, size, modelOptions } = options

    const resolved = resolveMediaPrompt(options.prompt)
    const prompt = resolved.text

    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

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
      return this.editImages({
        model: model as OpenAIImageModel,
        prompt,
        numberOfImages,
        size,
        modelOptions,
        imageInputs: resolved.images,
        logger: options.logger,
      })
    }

    // With exactOptionalPropertyTypes, vendor SDK request shapes reject
    // `T | undefined` in optional fields. Build the request incrementally and
    // only set `size` when it's actually defined.
    const request: OpenAI_SDK.Images.ImageGenerateParams = {
      model,
      prompt,
      n: numberOfImages ?? 1,
      ...(modelOptions ?? {}),
    }
    if (size !== undefined) {
      request.size = size
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
          // `GeneratedImage.revisedPrompt` is declared as `revisedPrompt?: string`
          // (no `| undefined`) so under exactOptionalPropertyTypes we must omit
          // the field entirely when the SDK didn't return one.
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

      // `ImageGenerationResult.usage` is `usage?: TokenUsage` without
      // `| undefined`, so spread the field only when the model reported usage.
      const usage = buildImagesUsage(response.usage)

      return {
        id: generateId(this.name),
        model,
        images,
        ...(usage ? { usage } : {}),
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

  /**
   * Image-conditioned generation via OpenAI's `images.edit()` endpoint.
   * dall-e-2 accepts 1 input image; gpt-image-1 / gpt-image-1-mini accept up
   * to 16; dall-e-3 rejects entirely. A part with `metadata.role === 'mask'`
   * is routed to the SDK's `mask` field (PNG with alpha channel).
   */
  private async editImages(args: {
    model: OpenAIImageModel
    prompt: string
    numberOfImages?: number
    size?: string
    modelOptions?: OpenAIImageProviderOptions
    imageInputs: ReadonlyArray<ImagePart<MediaInputMetadata>>
    logger: ImageGenerationOptions<OpenAIImageProviderOptions>['logger']
  }): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size, modelOptions, logger } = args
    const maxImages = EDIT_MAX_IMAGES[model]
    if (maxImages === 0) {
      throw new Error(
        `${this.name}: model "${model}" does not support image prompt parts. ` +
          `Use gpt-image-1, gpt-image-1-mini, or dall-e-2 for image-conditioned generation.`,
      )
    }

    const maskParts = args.imageInputs.filter(
      (part) => part.metadata?.role === 'mask',
    )
    const sourceParts = args.imageInputs.filter(
      (part) => part.metadata?.role !== 'mask',
    )

    if (maskParts.length > 1) {
      throw new Error(
        `${this.name}: only one input with metadata.role === 'mask' is supported per request.`,
      )
    }
    if (sourceParts.length === 0) {
      throw new Error(
        `${this.name}: the prompt contained only mask image parts; at least one source image is required.`,
      )
    }
    if (sourceParts.length > maxImages) {
      throw new Error(
        `${this.name}: model "${model}" accepts at most ${maxImages} source image(s); received ${sourceParts.length}.`,
      )
    }

    const sourceFiles = await Promise.all(
      sourceParts.map((part, i) => imagePartToFile(part, `source-${i}`)),
    )
    const [firstSourceFile] = sourceFiles
    const maskFile = maskParts[0]
      ? await imagePartToFile(maskParts[0], 'mask')
      : undefined

    // `modelOptions` is typed across all four image models (including dall-e-3's
    // `quality: 'hd' | 'standard'` which isn't valid for edit). dall-e-3 has
    // already been rejected above, so any remaining quality value is valid for
    // the edit endpoint — cast the spread to clear the union mismatch.
    const request: OpenAI_SDK.Images.ImageEditParamsNonStreaming = {
      model,
      prompt,
      image:
        firstSourceFile && sourceFiles.length === 1
          ? firstSourceFile
          : sourceFiles,
      n: numberOfImages ?? 1,
      stream: false,
      ...((modelOptions ??
        {}) as Partial<OpenAI_SDK.Images.ImageEditParamsNonStreaming>),
    }
    if (size !== undefined) {
      request.size = size
    }
    if (maskFile) {
      request.mask = maskFile
    }

    try {
      logger.request(
        `activity=imageEdit provider=${this.name} model=${model} n=${request.n ?? 1} size=${request.size ?? 'default'} sources=${sourceFiles.length}${maskFile ? ' mask' : ''}`,
        { provider: this.name, model },
      )
      const response = await this.client.images.edit(request)

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

      return {
        id: generateId(this.name),
        model,
        images,
        ...(() => {
          const usage = buildImagesUsage(response.usage)
          return usage ? { usage } : {}
        })(),
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.editImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.editImages failed`),
        source: `${this.name}.editImages`,
      })
      throw error
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
