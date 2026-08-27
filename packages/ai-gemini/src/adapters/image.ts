import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import { buildGeminiUsage } from '../usage'
import {
  isGeminiNativeImageModel,
  parseNativeImageSize,
  sizeToAspectRatio,
  validateImageSize,
  validateNumberOfImages,
  validatePrompt,
} from '../image/image-provider-options'
import type { GeminiImageModels } from '../model-meta'
import type {
  GeminiAnyImageProviderOptions,
  GeminiImageModelInputModalitiesByName,
  GeminiImageModelProviderOptionsByName,
  GeminiImageModelSizeByName,
  GeminiNativeImageProviderOptions,
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
  ImageConfig,
  Part,
} from '@google/genai'
import type { GeminiClientConfig } from '../utils/client'

function assignDefined<T, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value
  }
}

/**
 * Configuration for Gemini image adapter
 */
export interface GeminiImageConfig extends GeminiClientConfig {}

/** Model type for Gemini Image */
export type GeminiImageModel = GeminiImageModels

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
  GeminiAnyImageProviderOptions,
  GeminiImageModelProviderOptionsByName,
  GeminiImageModelSizeByName,
  GeminiImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'gemini' as const

  // Type-only property - never assigned at runtime
  declare '~types': {
    providerOptions: GeminiAnyImageProviderOptions
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
    options: ImageGenerationOptions<GeminiAnyImageProviderOptions>,
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

      if (isGeminiNativeImageModel(model)) {
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

  private async generateWithGeminiApi(
    options: ImageGenerationOptions<GeminiNativeImageProviderOptions>,
    resolved: ResolvedMediaPrompt,
  ): Promise<ImageGenerationResult> {
    const { model, size, numberOfImages, modelOptions } = options

    const parsedSize = size ? parseNativeImageSize(size) : undefined

    // The portable `size` option is the baseline; modelOptions.imageConfig is
    // the provider escape hatch and wins per field, so a caller passing only
    // `imageConfig.imageSize` keeps the aspectRatio derived from `size`.
    const imageConfig: ImageConfig = {
      ...(parsedSize?.aspectRatio && { aspectRatio: parsedSize.aspectRatio }),
      ...(parsedSize?.resolution && { imageSize: parsedSize.resolution }),
      ...modelOptions?.imageConfig,
    }

    // Named picks, never a wholesale spread: the Imagen-shaped fields of
    // GeminiImageProviderOptions (personGeneration, safetyFilterLevel,
    // addWatermark, outputMimeType, …) are only valid on GenerateImagesConfig
    // and would be rejected by generateContent. Picking by name means no
    // Imagen field can reach this path even if one slips past the per-model
    // provider-options map.
    const nativeConfig: GenerateContentConfig = {
      ...(modelOptions?.seed !== undefined && { seed: modelOptions.seed }),
      ...(modelOptions?.safetySettings !== undefined && {
        safetySettings: modelOptions.safetySettings,
      }),
      ...(modelOptions?.thinkingConfig !== undefined && {
        thinkingConfig: modelOptions.thinkingConfig,
      }),
      ...(modelOptions?.systemInstruction !== undefined && {
        systemInstruction: modelOptions.systemInstruction,
      }),
    }

    const config: GenerateContentConfig = {
      ...nativeConfig,
      // Include TEXT so the model can interleave descriptions between images.
      // IMPORTANT: responseModalities is a protected default — set it AFTER
      // nativeConfig so nothing can silently disable image output.
      responseModalities: ['TEXT', 'IMAGE'],
      ...(Object.keys(imageConfig).length > 0 && { imageConfig }),
    }

    const contents = this.buildContents(resolved, numberOfImages)

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
  private buildContents(
    resolved: ResolvedMediaPrompt,
    numberOfImages: number | undefined,
  ): string | Array<Content> {
    const countInstruction =
      numberOfImages && numberOfImages > 1
        ? `Generate ${numberOfImages} distinct images.`
        : undefined

    if (resolved.images.length === 0) {
      return countInstruction
        ? `${resolved.text} ${countInstruction}`
        : resolved.text
    }

    const parts: Array<Part> = resolved.parts.map((part) => {
      if (part.type === 'text') {
        return { text: part.content }
      }
      if (part.type === 'image') {
        return this.imagePartToGeminiPart(part)
      }
      // Video / audio parts were rejected in generateImages above.
      throw new Error(
        `gemini: unsupported prompt part type "${part.type}" in image generation.`,
      )
    })
    if (countInstruction) {
      parts.push({ text: countInstruction })
    }
    return [{ role: 'user', parts }]
  }

  private imagePartToGeminiPart(part: ImagePart<MediaInputMetadata>): Part {
    if (part.source.type === 'data') {
      return {
        inlineData: {
          mimeType: part.source.mimeType || 'image/png',
          data: part.source.value,
        },
      }
    }
    // URL sources (public HTTPS, Files API URIs, gs://) pass through as
    // `fileData` and Gemini fetches them server-side — same as the chat
    // adapter. Fetching locally and inlining as base64 double-buffers the
    // image and OOMs on memory-constrained runtimes (e.g. Cloudflare
    // Workers).
    return {
      fileData: {
        fileUri: part.source.value,
        mimeType: part.source.mimeType ?? 'image/jpeg',
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
    options: ImageGenerationOptions<GeminiAnyImageProviderOptions>,
  ): GenerateImagesConfig {
    const { size, numberOfImages, modelOptions } = options
    const config: GenerateImagesConfig = {
      numberOfImages: numberOfImages ?? 1,
    }
    const sizeAspectRatio = size ? sizeToAspectRatio(size) : undefined
    assignDefined(
      config,
      'aspectRatio',
      modelOptions?.aspectRatio ?? sizeAspectRatio,
    )
    if (!modelOptions) return config
    assignDefined(config, 'personGeneration', modelOptions.personGeneration)
    assignDefined(config, 'safetyFilterLevel', modelOptions.safetyFilterLevel)
    assignDefined(config, 'seed', modelOptions.seed)
    assignDefined(config, 'addWatermark', modelOptions.addWatermark)
    assignDefined(config, 'language', modelOptions.language)
    assignDefined(config, 'negativePrompt', modelOptions.negativePrompt)
    assignDefined(config, 'outputMimeType', modelOptions.outputMimeType)
    assignDefined(
      config,
      'outputCompressionQuality',
      modelOptions.outputCompressionQuality,
    )
    assignDefined(config, 'guidanceScale', modelOptions.guidanceScale)
    assignDefined(config, 'enhancePrompt', modelOptions.enhancePrompt)
    assignDefined(
      config,
      'includeSafetyAttributes',
      modelOptions.includeSafetyAttributes,
    )
    assignDefined(config, 'includeRaiReason', modelOptions.includeRaiReason)
    assignDefined(config, 'outputGcsUri', modelOptions.outputGcsUri)
    assignDefined(config, 'labels', modelOptions.labels)
    return config
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

/** @deprecated Shut down 2026-06-25. Use `gemini-3.1-flash-image`. */
export function createGeminiImage(
  model: 'gemini-3.1-flash-image-preview',
  apiKey: string,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<'gemini-3.1-flash-image-preview'>
/** @deprecated Shut down 2026-06-25. Use `gemini-3-pro-image`. */
export function createGeminiImage(
  model: 'gemini-3-pro-image-preview',
  apiKey: string,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<'gemini-3-pro-image-preview'>
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
): GeminiImageAdapter<TModel>
export function createGeminiImage<TModel extends GeminiImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<TModel> {
  return new GeminiImageAdapter({ apiKey, ...config }, model)
}

/** @deprecated Shut down 2026-06-25. Use `gemini-3.1-flash-image`. */
export function geminiImage(
  model: 'gemini-3.1-flash-image-preview',
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<'gemini-3.1-flash-image-preview'>
/** @deprecated Shut down 2026-06-25. Use `gemini-3-pro-image`. */
export function geminiImage(
  model: 'gemini-3-pro-image-preview',
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<'gemini-3-pro-image-preview'>
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
): GeminiImageAdapter<TModel>
export function geminiImage<TModel extends GeminiImageModel>(
  model: TModel,
  config?: Omit<GeminiImageConfig, 'apiKey'>,
): GeminiImageAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiImage(model, apiKey, config)
}
