import {
  fileReferenceFor,
  isFileSource,
  resolveMediaPrompt,
} from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import { flattenModalityTokenCounts, hasModalityTokens } from '../usage'
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
  TokenUsage,
} from '@tanstack/ai'
import { ThinkingLevel } from '@google/genai'
import type {
  Content,
  ContentUnion,
  GenerateImagesConfig,
  GenerateImagesResponse,
  GoogleGenAI,
  Interactions,
  Part,
  SafetySetting,
  ThinkingConfig,
} from '@google/genai'
import type { GeminiClientConfig } from '../utils/client'

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
 * image models like Nano Banana 2 (via the Interactions API).
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
  // Consumes Gemini Files API references (geminiFiles()) as interaction image URIs.
  override readonly supportsFileSources = true

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

      if (options.modelOptions?.previous_interaction_id) {
        throw new Error(
          `${this.name}: previous_interaction_id is only supported on Gemini-native image models.`,
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
    // Named picks, never a wholesale spread of imageConfig. The portable
    // `size` is the baseline; modelOptions.imageConfig wins per field.
    const aspectRatio =
      modelOptions?.imageConfig?.aspectRatio ?? parsedSize?.aspectRatio
    const imageSize = interactionImageSize(
      modelOptions?.imageConfig?.imageSize ?? parsedSize?.resolution,
    )

    const thinking = modelOptions?.thinkingConfig
    if (thinking?.thinkingBudget !== undefined) {
      throw new Error(
        `${this.name}: thinkingConfig.thinkingBudget is not supported on the Interactions image API. Set thinkingConfig.thinkingLevel ('minimal' | 'low' | 'medium' | 'high') instead.`,
      )
    }

    const generationConfig: Interactions.GenerationConfig = {
      ...(modelOptions?.seed !== undefined && { seed: modelOptions.seed }),
      ...interactionThinking(thinking),
    }

    // safety_settings is not on the SDK param type. Assign it after the
    // object is built so the JSON body still carries it.
    const request = {
      model,
      input: this.buildInteractionInput(resolved, numberOfImages),
      stream: false as const,
      response_format: {
        type: 'image' as const,
        ...(aspectRatio !== undefined && { aspect_ratio: aspectRatio }),
        ...(imageSize !== undefined && { image_size: imageSize }),
      },
      ...(modelOptions?.systemInstruction !== undefined && {
        system_instruction: systemInstructionText(
          modelOptions.systemInstruction,
        ),
      }),
      ...(Object.keys(generationConfig).length > 0 && {
        generation_config: generationConfig,
      }),
      ...(modelOptions?.previous_interaction_id && {
        previous_interaction_id: modelOptions.previous_interaction_id,
      }),
      ...(modelOptions?.store !== undefined && { store: modelOptions.store }),
    }
    if (
      modelOptions?.safetySettings !== undefined &&
      modelOptions.safetySettings.length > 0
    ) {
      Object.assign(request, {
        safety_settings: modelOptions.safetySettings.map(interactionSafety),
      })
    }

    const interaction = options.abortSignal
      ? await this.client.interactions.create(request, {
          signal: options.abortSignal,
        })
      : await this.client.interactions.create(request)

    return this.transformInteractionResponse(model, interaction)
  }

  /**
   * Text-only prompts pass through as a string. Prompts with image parts
   * become content blocks in prompt order. The Interactions API has no
   * image count, so more than one image appends an instruction.
   */
  private buildInteractionInput(
    resolved: ResolvedMediaPrompt,
    numberOfImages: number | undefined,
  ): string | Array<Interactions.Content> {
    const countInstruction =
      numberOfImages && numberOfImages > 1
        ? `Generate ${numberOfImages} distinct images.`
        : undefined

    if (resolved.images.length === 0) {
      return countInstruction
        ? `${resolved.text} ${countInstruction}`
        : resolved.text
    }

    const blocks: Array<Interactions.Content> = resolved.parts.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.content }
      }
      if (part.type === 'image') {
        return this.imagePartToInteraction(part)
      }
      throw new Error(
        `gemini: unsupported prompt part type "${part.type}" in image generation.`,
      )
    })
    if (countInstruction) {
      blocks.push({ type: 'text', text: countInstruction })
    }
    return blocks
  }

  private imagePartToInteraction(
    part: ImagePart<MediaInputMetadata>,
  ): Interactions.ImageContent {
    if (part.source.type === 'data') {
      return {
        type: 'image',
        data: part.source.value,
        mime_type: part.source.mimeType || 'image/png',
      }
    }
    // URL and Files API sources pass through as `uri`. Gemini fetches them.
    // Fetching locally and inlining as base64 OOMs on constrained runtimes.
    const uri = isFileSource(part.source)
      ? fileReferenceFor(part.source, this.name)
      : part.source.value
    return {
      type: 'image',
      uri,
      mime_type: part.source.mimeType ?? 'image/jpeg',
    }
  }

  private transformInteractionResponse(
    model: string,
    interaction: Interactions.Interaction,
  ): ImageGenerationResult {
    if (interaction.status !== 'completed') {
      throw new Error(
        `Gemini ${model} image interaction ended with status "${interaction.status}".`,
      )
    }
    if (!interaction.id) {
      throw new Error(`Gemini ${model} image interaction returned no id.`)
    }

    const images: Array<GeneratedImage> = []
    const textParts: Array<string> = []
    for (const step of interaction.steps ?? []) {
      if (step.type !== 'model_output') continue
      for (const block of step.content ?? []) {
        if (block.type === 'image') {
          const image = generatedImageFromBlock(block)
          if (image) images.push(image)
        } else if (block.type === 'text' && block.text.length > 0) {
          textParts.push(block.text)
        }
      }
    }
    if (images.length === 0 && interaction.output_image) {
      const image = generatedImageFromBlock(interaction.output_image)
      if (image) images.push(image)
    }

    if (images.length === 0) {
      if (textParts.length === 0 && interaction.output_text) {
        textParts.push(interaction.output_text)
      }
      const reason =
        textParts.length > 0
          ? `: ${textParts.join(' ').trim()}`
          : ' (no image was returned).'
      throw new Error(`Gemini ${model} returned no images${reason}`)
    }

    const usage = interactionImageUsage(interaction.usage)
    return {
      id: interaction.id,
      model,
      images,
      ...(usage ? { usage } : {}),
    }
  }

  private buildImagenConfig(
    options: ImageGenerationOptions<GeminiAnyImageProviderOptions>,
  ): GenerateImagesConfig {
    const { size, numberOfImages, modelOptions } = options

    // Build with conditional spreads — under exactOptionalPropertyTypes the
    // vendor `GenerateImagesConfig` fields are `field?: T` (no `| undefined`),
    // so we can only assign the property when we actually have a value.
    const sizeAspectRatio = size ? sizeToAspectRatio(size) : undefined

    // Named picks, never a wholesale spread — the mirror image of the native
    // path below. A native-only field (safetySettings, thinkingConfig,
    // imageConfig, systemInstruction) belongs to GenerateContentConfig and is
    // rejected by generateImages with 400 INVALID_ARGUMENT, so it must not be
    // able to reach here even when the caller's `modelOptions` was typed
    // against both shapes at once (e.g. an adapter inferred from a union of
    // model names).
    return {
      numberOfImages: numberOfImages ?? 1,
      // Map size to aspect ratio if provided; modelOptions.aspectRatio,
      // picked after it, overrides.
      ...(sizeAspectRatio !== undefined && { aspectRatio: sizeAspectRatio }),
      ...(modelOptions?.aspectRatio !== undefined && {
        aspectRatio: modelOptions.aspectRatio,
      }),
      ...(modelOptions?.personGeneration !== undefined && {
        personGeneration: modelOptions.personGeneration,
      }),
      ...(modelOptions?.safetyFilterLevel !== undefined && {
        safetyFilterLevel: modelOptions.safetyFilterLevel,
      }),
      ...(modelOptions?.seed !== undefined && { seed: modelOptions.seed }),
      ...(modelOptions?.addWatermark !== undefined && {
        addWatermark: modelOptions.addWatermark,
      }),
      ...(modelOptions?.language !== undefined && {
        language: modelOptions.language,
      }),
      ...(modelOptions?.negativePrompt !== undefined && {
        negativePrompt: modelOptions.negativePrompt,
      }),
      ...(modelOptions?.outputMimeType !== undefined && {
        outputMimeType: modelOptions.outputMimeType,
      }),
      ...(modelOptions?.outputCompressionQuality !== undefined && {
        outputCompressionQuality: modelOptions.outputCompressionQuality,
      }),
      ...(modelOptions?.guidanceScale !== undefined && {
        guidanceScale: modelOptions.guidanceScale,
      }),
      ...(modelOptions?.enhancePrompt !== undefined && {
        enhancePrompt: modelOptions.enhancePrompt,
      }),
      ...(modelOptions?.includeSafetyAttributes !== undefined && {
        includeSafetyAttributes: modelOptions.includeSafetyAttributes,
      }),
      ...(modelOptions?.includeRaiReason !== undefined && {
        includeRaiReason: modelOptions.includeRaiReason,
      }),
      ...(modelOptions?.outputGcsUri !== undefined && {
        outputGcsUri: modelOptions.outputGcsUri,
      }),
      ...(modelOptions?.labels !== undefined && {
        labels: modelOptions.labels,
      }),
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

function interactionThinking(
  thinking: ThinkingConfig | undefined,
): Pick<
  Interactions.GenerationConfig,
  'thinking_level' | 'thinking_summaries'
> {
  if (!thinking) return {}
  const level = interactionThinkingLevel(thinking.thinkingLevel)
  return {
    ...(level !== undefined && { thinking_level: level }),
    ...(thinking.includeThoughts !== undefined && {
      thinking_summaries: thinking.includeThoughts ? 'auto' : 'none',
    }),
  }
}

function interactionImageSize(
  value: string | undefined,
): '512' | '1K' | '2K' | '4K' | undefined {
  if (value === '512' || value === '1K' || value === '2K' || value === '4K') {
    return value
  }
  return undefined
}

function interactionThinkingLevel(
  level: ThinkingConfig['thinkingLevel'],
): 'minimal' | 'low' | 'medium' | 'high' | undefined {
  switch (level) {
    case ThinkingLevel.MINIMAL:
      return 'minimal'
    case ThinkingLevel.LOW:
      return 'low'
    case ThinkingLevel.MEDIUM:
      return 'medium'
    case ThinkingLevel.HIGH:
      return 'high'
    case ThinkingLevel.THINKING_LEVEL_UNSPECIFIED:
    case undefined:
      return undefined
  }
}

function interactionSafety(setting: SafetySetting): {
  type: string
  threshold: string
} {
  const category = setting.category
  const threshold = setting.threshold
  if (!category || category === 'HARM_CATEGORY_UNSPECIFIED') {
    throw new Error(
      'gemini: safetySettings.category is required on the Interactions image API.',
    )
  }
  if (!threshold || threshold === 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
    throw new Error(
      'gemini: safetySettings.threshold is required on the Interactions image API.',
    )
  }
  return {
    type: category.replace(/^HARM_CATEGORY_/, '').toLowerCase(),
    threshold: threshold.toLowerCase(),
  }
}

function systemInstructionText(instruction: ContentUnion): string {
  if (typeof instruction === 'string') return instruction
  if (Array.isArray(instruction)) {
    return instruction.map(partUnionText).join('')
  }
  if (isPart(instruction)) return partUnionText(instruction)
  const parts = instruction.parts
  if (!parts || parts.length === 0) {
    throw new Error(
      'gemini: systemInstruction on the Interactions image API must be text.',
    )
  }
  return parts.map(partUnionText).join('')
}

function isPart(value: Content | Part): value is Part {
  return !('parts' in value)
}

function partUnionText(part: Part | string): string {
  if (typeof part === 'string') return part
  if (
    part.inlineData ||
    part.fileData ||
    part.functionCall ||
    part.functionResponse
  ) {
    throw new Error(
      'gemini: systemInstruction on the Interactions image API must be text. Inline media is not supported.',
    )
  }
  if (typeof part.text !== 'string') {
    throw new Error(
      'gemini: systemInstruction on the Interactions image API must be text.',
    )
  }
  return part.text
}

function generatedImageFromBlock(block: {
  data?: string
  uri?: string
}): GeneratedImage | undefined {
  if (typeof block.data === 'string' && block.data.length > 0) {
    return { b64Json: block.data }
  }
  if (typeof block.uri === 'string' && block.uri.length > 0) {
    return { url: block.uri }
  }
  return undefined
}

function interactionImageUsage(
  usage: Interactions.Interaction['usage'],
): TokenUsage | undefined {
  if (!usage) return undefined
  const promptTokens = usage.total_input_tokens ?? 0
  const completionTokens = usage.total_output_tokens ?? 0
  const promptModalities = flattenModalityTokenCounts(
    usage.input_tokens_by_modality?.map((item) => ({
      modality: item.modality,
      tokenCount: item.tokens,
    })),
  )
  const completionModalities = flattenModalityTokenCounts(
    usage.output_tokens_by_modality?.map((item) => ({
      modality: item.modality,
      tokenCount: item.tokens,
    })),
  )
  const promptTokensDetails = {
    ...(hasModalityTokens(promptModalities) ? promptModalities : {}),
    ...(usage.total_cached_tokens
      ? { cachedTokens: usage.total_cached_tokens }
      : {}),
  }
  const completionTokensDetails = {
    ...(hasModalityTokens(completionModalities) ? completionModalities : {}),
    ...(usage.total_thought_tokens
      ? { reasoningTokens: usage.total_thought_tokens }
      : {}),
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
    ...(Object.keys(promptTokensDetails).length > 0
      ? { promptTokensDetails }
      : {}),
    ...(Object.keys(completionTokensDetails).length > 0
      ? { completionTokensDetails }
      : {}),
  }
}
