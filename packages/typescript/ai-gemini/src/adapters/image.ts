import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import {
  parseNativeImageSize,
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type { GEMINI_IMAGE_MODELS } from '../model-meta'
import type {
  GeminiImageModelProviderOptionsByName,
  GeminiImageModelSizeByName,
  GeminiImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
} from '@tanstack/ai'
import type {
  GenerateContentConfig,
  GenerateContentResponse,
  GenerateImagesConfig,
  GenerateImagesResponse,
  GoogleGenAI,
} from '@google/genai'
import type { GeminiClientConfig } from '../utils'

/**
 * Configuration for Gemini image adapter
 */
export interface GeminiImageConfig extends GeminiClientConfig {}

/** Model type for Gemini Image */
export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number]

/**
 * Gemini Image Generation Adapter
 *
 * Tree-shakeable adapter for Gemini image generation functionality.
 * Supports Imagen 3/4 models (via generateImages API) and Gemini native
 * image models like Nano Banana 2 (via generateContent API).
 *
 * Features:
 * - Aspect ratio-based image sizing
 * - Person generation controls
 * - Safety filtering
 * - Watermark options
 * - Extended resolution tiers (Nano Banana 2)
 */
export class GeminiImageAdapter<
  TModel extends GeminiImageModel,
> extends BaseImageAdapter<
  TModel,
  GeminiImageProviderOptions,
  GeminiImageModelProviderOptionsByName,
  GeminiImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'gemini' as const

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: GeminiImageProviderOptions
    modelProviderOptionsByName: GeminiImageModelProviderOptionsByName
    modelSizeByName: GeminiImageModelSizeByName
  }

  private client: GoogleGenAI

  constructor(config: GeminiImageConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt } = options

    validatePrompt({ prompt, model })

    if (this.isGeminiImageModel(model)) {
      return this.generateWithGeminiApi(options)
    }

    // Imagen models path (generateImages API)
    validateImageSize(model, options.size)
    validateNumberOfImages(model, options.numberOfImages)

    const config = this.buildImagenConfig(options)

    const response = await this.client.models.generateImages({
      model,
      prompt,
      config,
    })

    return this.transformImagenResponse(model, response)
  }

  private isGeminiImageModel(model: string): boolean {
    return model.startsWith('gemini-')
  }

  private async generateWithGeminiApi(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, size, numberOfImages, modelOptions } = options

    const parsedSize = size ? parseNativeImageSize(size) : undefined

    // The generateContent API has no numberOfImages parameter.
    // Instead, augment the prompt to request multiple images when needed.
    const augmentedPrompt =
      numberOfImages && numberOfImages > 1
        ? `${prompt} Generate ${numberOfImages} distinct images.`
        : prompt

    const config: GenerateContentConfig = {
      // Include TEXT so the model can interleave descriptions between images
      responseModalities: ['TEXT', 'IMAGE'],
      ...(parsedSize && {
        imageConfig: {
          ...(parsedSize.aspectRatio && {
            aspectRatio: parsedSize.aspectRatio,
          }),
          ...(parsedSize.resolution && {
            imageSize: parsedSize.resolution,
          }),
        },
      }),
      ...modelOptions,
    }

    const response = await this.client.models.generateContent({
      model,
      contents: augmentedPrompt,
      config,
    })

    return this.transformGeminiResponse(model, response)
  }

  private transformGeminiResponse(
    model: string,
    response: GenerateContentResponse,
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = []
    const parts = response.candidates?.[0]?.content?.parts ?? []

    for (const part of parts) {
      if (
        part.inlineData?.data &&
        typeof part.inlineData.data === 'string' &&
        part.inlineData.data.length > 0
      ) {
        images.push({ b64Json: part.inlineData.data })
      }
    }

    return {
      id: generateId(this.name),
      model,
      images,
      usage: undefined,
    }
  }

  private buildImagenConfig(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
  ): GenerateImagesConfig {
    const { size, numberOfImages, modelOptions } = options

    return {
      numberOfImages: numberOfImages ?? 1,
      // Map size to aspect ratio if provided (modelOptions.aspectRatio will override)
      aspectRatio: size ? sizeToAspectRatio(size) : undefined,
      ...modelOptions,
    }
  }

  private transformImagenResponse(
    model: string,
    response: GenerateImagesResponse,
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = (response.generatedImages ?? []).map(
      (item) => ({
        b64Json: item.image?.imageBytes,
        revisedPrompt: item.enhancedPrompt,
      }),
    )

    return {
      id: generateId(this.name),
      model,
      images,
      usage: undefined,
    }
  }
}

/**
 * Creates a Gemini image adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'imagen-3.0-generate-002')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini image adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGeminiImage('imagen-3.0-generate-002', "your-api-key");
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createGeminiImage<TModel extends GeminiImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<TModel> {
  return new GeminiImageAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Gemini image adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'imagen-4.0-generate-001')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini image adapter instance with resolved types
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiImage('imagen-4.0-generate-001');
 *
 * const result = await generateImage({
 *   adapter,
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function geminiImage<TModel extends GeminiImageModel>(
  model: TModel,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiImage(model, apiKey, config)
}
