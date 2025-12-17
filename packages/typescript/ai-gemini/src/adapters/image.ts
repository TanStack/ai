import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { GEMINI_IMAGE_MODELS } from '../model-meta'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import {
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
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
  GenerateImagesConfig,
  GenerateImagesResponse,
  GoogleGenAI,
} from '@google/genai'
import type { GeminiClientConfig } from '../utils'

/**
 * Configuration for Gemini image adapter
 */
export interface GeminiImageConfig extends GeminiClientConfig {}

/**
 * Gemini Image Generation Adapter
 *
 * Tree-shakeable adapter for Gemini Imagen image generation functionality.
 * Supports Imagen 3 and Imagen 4 models.
 *
 * Features:
 * - Aspect ratio-based image sizing
 * - Person generation controls
 * - Safety filtering
 * - Watermark options
 */
export class GeminiImageAdapter extends BaseImageAdapter<
  typeof GEMINI_IMAGE_MODELS,
  GeminiImageProviderOptions,
  GeminiImageModelProviderOptionsByName,
  GeminiImageModelSizeByName
> {
  readonly kind = 'image' as const
  readonly name = 'gemini' as const
  readonly models = GEMINI_IMAGE_MODELS

  // Type-only property - never assigned at runtime
  declare _types: {
    providerOptions: GeminiImageProviderOptions
    modelProviderOptionsByName: GeminiImageModelProviderOptionsByName
    modelSizeByName: GeminiImageModelSizeByName
  }

  private client: GoogleGenAI

  constructor(config: GeminiImageConfig) {
    super({})
    this.client = createGeminiClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, prompt, numberOfImages, size } = options

    // Validate inputs
    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

    // Build request config
    const config = this.buildConfig(options)

    const response = await this.client.models.generateImages({
      model,
      prompt,
      config,
    })

    return this.transformResponse(model, response)
  }

  private buildConfig(
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

  private transformResponse(
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
 * Creates a Gemini image adapter with explicit API key
 *
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini image adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createGeminiImage("your-api-key");
 *
 * const result = await generateImage({
 *   adapter,
 *   model: 'imagen-3.0-generate-002',
 *   prompt: 'A cute baby sea otter'
 * });
 * ```
 */
export function createGeminiImage(
  apiKey: string,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter {
  return new GeminiImageAdapter({ apiKey, ...config })
}

/**
 * Creates a Gemini image adapter with automatic API key detection from environment variables.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini image adapter instance
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiImage();
 *
 * const result = await generateImage({
 *   adapter,
 *   model: 'imagen-4.0-generate-001',
 *   prompt: 'A beautiful sunset over mountains'
 * });
 * ```
 */
export function geminiImage(
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiImage(apiKey, config)
}
