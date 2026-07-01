import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import { buildGeminiUsage } from '../usage'
import {
  parseNativeImageSize,
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type { GEMINI_IMAGE_MODELS } from '../model-meta'
import type {
  GeminiImageModelInputModalitiesByName,
  GeminiImageModelProviderOptionsByName,
  GeminiImageModelSizeByName,
  GeminiImageProviderOptions,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePart,
  MediaInputMetadata,
  ResolvedMediaPrompt,
} from '@tanstack/ai'
import type {
  Content,
  GenerateContentConfig,
  GenerateContentResponse,
  GenerateImagesConfig,
  GenerateImagesResponse,
  GoogleGenAI,
  Part,
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
  GeminiImageModelSizeByName,
  GeminiImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'gemini' as const

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: GeminiImageProviderOptions
    modelProviderOptionsByName: GeminiImageModelProviderOptionsByName
    modelSizeByName: GeminiImageModelSizeByName
    modelInputModalitiesByName: GeminiImageModelInputModalitiesByName
  }

  private readonly client: GoogleGenAI

  constructor(config: GeminiImageConfig, model: TModel) {
    super(model, config)
    this.client = createGeminiClient(config)
  }

  async generateImages(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, logger } = options

    logger.request(
      `activity=generateImage provider=gemini model=${this.model}`,
      {
        provider: 'gemini',
        model: this.model,
      },
    )

    try {
      const resolved = resolveMediaPrompt(options.prompt)

      // Image-only prompts are allowed (the image inputs carry the intent);
      // a prompt with neither text nor images is always an error.
      if (resolved.images.length === 0) {
        validatePrompt({ prompt: resolved.text, model })
      }

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

      if (this.isGeminiImageModel(model)) {
        return await this.generateWithGeminiApi(options, resolved)
      }

      // Imagen does not accept image inputs — it's strictly text-to-image.
      if (resolved.images.length > 0) {
        throw new Error(
          `${this.name}: model "${model}" (Imagen) does not support image prompt parts. ` +
            `Use a Gemini-native image model (e.g. gemini-2.5-flash-image, "nano-banana") for image-conditioned generation.`,
        )
      }

      // Imagen models path (generateImages API)
      validateImageSize(model, options.size)
      validateNumberOfImages(model, options.numberOfImages)

      const config = this.buildImagenConfig(options)

      const response = await this.client.models.generateImages({
        model,
        prompt: resolved.text,
        config,
      })

      return this.transformImagenResponse(model, response)
    } catch (error) {
      logger.errors('gemini.generateImage fatal', {
        error,
        source: 'gemini.generateImage',
      })
      throw error
    }
  }

  private isGeminiImageModel(model: string): boolean {
    return model.startsWith('gemini-')
  }

  private async generateWithGeminiApi(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
    resolved: ResolvedMediaPrompt,
  ): Promise<ImageGenerationResult> {
    const { model, size, numberOfImages, modelOptions } = options

    const parsedSize = size ? parseNativeImageSize(size) : undefined

    // GeminiImageProviderOptions is Imagen-shaped — most fields
    // (personGeneration, safetyFilterLevel, addWatermark, outputMimeType,
    // outputCompressionQuality, guidanceScale, enhancePrompt,
    // includeSafetyAttributes, includeRaiReason, outputGcsUri, labels,
    // negativePrompt, language) are only valid on GenerateImagesConfig and
    // would be rejected by the Gemini-native generateContent path. Pick only
    // the fields that are valid on GenerateContentConfig instead of spreading
    // the whole options object.
    const nativeConfig: GenerateContentConfig = {}
    if (modelOptions?.seed !== undefined) {
      nativeConfig.seed = modelOptions.seed
    }

    const config: GenerateContentConfig = {
      ...nativeConfig,
      // Include TEXT so the model can interleave descriptions between images.
      // IMPORTANT: responseModalities is a protected default — set it AFTER
      // nativeConfig so nothing can silently disable image output.
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
    }

    const contents = await this.buildContents(resolved, numberOfImages)

    const response = await this.client.models.generateContent({
      model,
      contents,
      config,
    })

    return this.transformGeminiResponse(model, response)
  }

  /**
   * Build the multimodal `contents` payload. Text-only prompts pass through
   * as a plain string (the SDK accepts it directly); prompts with image
   * parts become a single user `Content` whose `parts` mirror the prompt's
   * interleaved order — position is meaningful to Gemini ("not like this
   * *(image)*, more like this *(image)*").
   *
   * The generateContent API has no numberOfImages parameter, so when more
   * than one image is requested a trailing instruction is appended.
   */
  private async buildContents(
    resolved: ResolvedMediaPrompt,
    numberOfImages: number | undefined,
  ): Promise<string | Array<Content>> {
    const countInstruction =
      numberOfImages && numberOfImages > 1
        ? `Generate ${numberOfImages} distinct images.`
        : undefined

    if (resolved.images.length === 0) {
      return countInstruction
        ? `${resolved.text} ${countInstruction}`
        : resolved.text
    }

    const parts: Array<Part> = await Promise.all(
      resolved.parts.map((part) => {
        if (part.type === 'text') {
          return Promise.resolve<Part>({ text: part.content })
        }
        if (part.type === 'image') {
          return this.imagePartToGeminiPart(part)
        }
        // Video / audio parts were rejected in generateImages above.
        throw new Error(
          `gemini: unsupported prompt part type "${part.type}" in image generation.`,
        )
      }),
    )
    if (countInstruction) {
      parts.push({ text: countInstruction })
    }
    return [{ role: 'user', parts }]
  }

  private async imagePartToGeminiPart(
    part: ImagePart<MediaInputMetadata>,
  ): Promise<Part> {
    if (part.source.type === 'data') {
      return {
        inlineData: {
          mimeType: part.source.mimeType || 'image/png',
          data: part.source.value,
        },
      }
    }
    // For URL sources, prefer passing the URL through as `fileData` when it
    // looks like a Google Files API URI; otherwise fetch and inline as base64.
    if (
      part.source.value.startsWith('gs://') ||
      /^https?:\/\/generativelanguage\.googleapis\.com\//.test(
        part.source.value,
      )
    ) {
      return {
        fileData: {
          fileUri: part.source.value,
          ...(part.source.mimeType && { mimeType: part.source.mimeType }),
        },
      }
    }
    const response = await fetch(part.source.value)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image input (${response.status} ${response.statusText}): ${part.source.value}`,
      )
    }
    const blob = await response.blob()
    const buffer = await blob.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    return {
      inlineData: {
        mimeType: part.source.mimeType || blob.type || 'image/png',
        data: base64,
      },
    }
  }

  private transformGeminiResponse(
    model: string,
    response: GenerateContentResponse,
  ): ImageGenerationResult {
    const images: Array<GeneratedImage> = []
    const textParts: Array<string> = []
    const parts = response.candidates?.[0]?.content?.parts ?? []

    for (const part of parts) {
      if (
        part.inlineData?.data &&
        typeof part.inlineData.data === 'string' &&
        part.inlineData.data.length > 0
      ) {
        images.push({ b64Json: part.inlineData.data })
      } else if (typeof part.text === 'string' && part.text.length > 0) {
        textParts.push(part.text)
      }
    }

    // If the model returned only text parts (for example a safety refusal
    // or a "can't do that" message), surface the text instead of silently
    // resolving to an empty images array — otherwise callers can't tell a
    // generation failure apart from a genuine empty response.
    if (images.length === 0) {
      const reason =
        textParts.length > 0
          ? `: ${textParts.join(' ').trim()}`
          : ' (no inline image or text parts were returned).'
      throw new Error(`Gemini ${model} returned no images${reason}`)
    }

    return {
      id: generateId(this.name),
      model,
      images,
      // Surface token usage (with per-modality breakdown) when the model
      // reports it (e.g. Nano Banana via generateContent). Conditionally spread
      // to satisfy exactOptionalPropertyTypes — only include usage when
      // present. See #330.
      ...(response.usageMetadata
        ? { usage: buildGeminiUsage(response.usageMetadata) }
        : {}),
    }
  }

  private buildImagenConfig(
    options: ImageGenerationOptions<GeminiImageProviderOptions>,
  ): GenerateImagesConfig {
    const { size, numberOfImages, modelOptions } = options

    // Build with conditional spreads — under exactOptionalPropertyTypes the
    // vendor `GenerateImagesConfig` fields are `field?: T` (no `| undefined`),
    // so we can only assign the property when we actually have a value.
    const sizeAspectRatio = size ? sizeToAspectRatio(size) : undefined
    return {
      numberOfImages: numberOfImages ?? 1,
      // Map size to aspect ratio if provided (modelOptions.aspectRatio will override)
      ...(sizeAspectRatio !== undefined && { aspectRatio: sizeAspectRatio }),
      ...modelOptions,
    }
  }

  private transformImagenResponse(
    model: string,
    response: GenerateImagesResponse,
  ): ImageGenerationResult {
    const entries = response.generatedImages ?? []
    const images: Array<GeneratedImage> = []
    const filterReasons: Array<string> = []

    for (const item of entries) {
      const b64Json = item.image?.imageBytes
      if (b64Json) {
        images.push({
          b64Json,
          ...(item.enhancedPrompt !== undefined && {
            revisedPrompt: item.enhancedPrompt,
          }),
        })
        continue
      }
      // Imagen can drop individual entries with a raiFilteredReason when
      // Responsible-AI filters fire. Preserve the reason so callers can
      // surface it instead of silently getting back fewer images.
      const reason = (item as { raiFilteredReason?: string }).raiFilteredReason
      if (reason) {
        filterReasons.push(reason)
      }
    }

    // Every entry was filtered — no usable images to return. Throw rather
    // than resolve to an empty array so the caller is forced to handle the
    // failure mode explicitly.
    if (entries.length > 0 && images.length === 0) {
      const joined = filterReasons.length > 0 ? filterReasons.join('; ') : ''
      throw new Error(
        `Imagen ${model} returned no images: all ${entries.length} generated image(s) were filtered by Responsible-AI${joined ? ` (${joined})` : ''}.`,
      )
    }

    // Partial filter: surface via console.warn since ImageGenerationResult
    // has no warnings field. Callers that care can still inspect the count
    // mismatch between requested and returned images.
    if (filterReasons.length > 0 && typeof console !== 'undefined') {
      console.warn(
        `[gemini-image] ${filterReasons.length} of ${entries.length} images from ${model} were filtered by Responsible-AI: ${filterReasons.join('; ')}`,
      )
    }

    return {
      id: generateId(this.name),
      model,
      images,
    }
  }
}

/**
 * Creates a Gemini image adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'imagen-4.0-generate-001')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini image adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGeminiImage('imagen-4.0-generate-001', "your-api-key");
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
