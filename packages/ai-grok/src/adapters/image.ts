import OpenAI from 'openai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { buildImagesUsage } from '@tanstack/openai-base'
import { generateId } from '@tanstack/ai-utils'
import { getGrokApiKeyFromEnv, withGrokDefaults } from '../utils/client'
import {
  isGrokImagineImageModel,
  parseGrokImagineSize,
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
  ResolvedMediaPrompt,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { GrokImageModel } from '../model-meta'
import type {
  GrokImageModelInputModalitiesByName,
  GrokImageModelProviderOptionsByName,
  GrokImageModelSizeByName,
  GrokImageProviderOptions,
} from '../image/image-provider-options'
import type { GrokClientConfig } from '../utils/client'

/**
 * Configuration for Grok image adapter
 */
export interface GrokImageConfig extends GrokClientConfig {}

/** Maximum source images accepted by xAI's image edit endpoint. */
const MAX_EDIT_IMAGES = 3

/**
 * Maps the generic `size` option onto Imagine API parameters: the
 * "aspectRatio_resolution" template ("16:9_2k") splits into `aspect_ratio`
 * and optional `resolution` request fields.
 */
function imagineSizeParams(size: string | undefined): {
  aspect_ratio?: string
  resolution?: string
} {
  if (!size) return {}
  const parsed = parseGrokImagineSize(size)
  if (!parsed) return {}
  return {
    aspect_ratio: parsed.aspectRatio,
    ...(parsed.resolution !== undefined && { resolution: parsed.resolution }),
  }
}

/**
 * Convert a TanStack ImagePart to the URL string accepted by xAI's edit
 * endpoint: public URLs pass through (fetched by xAI's servers), data
 * sources become base64 data URIs.
 */
function imagePartToUrl(part: ImagePart<MediaInputMetadata>): string {
  if (part.source.type === 'url') return part.source.value
  return `data:${part.source.mimeType};base64,${part.source.value}`
}

/** Response shape of xAI's `/v1/images/edits` endpoint. */
interface GrokImageEditResponse {
  data?: Array<{
    url?: string | null
    b64_json?: string | null
    mime_type?: string
  }>
}

/**
 * Grok Image Generation Adapter
 *
 * Tree-shakeable adapter for Grok image generation functionality.
 * Supports the legacy grok-2-image-1212 model (text-to-image via the
 * OpenAI-compat endpoint) and the grok-imagine image models, which also
 * accept image prompt parts for image-conditioned generation via xAI's
 * `/v1/images/edits` endpoint (up to 3 source images).
 *
 * Features:
 * - Model-specific type-safe provider options
 * - Size / aspect-ratio validation per model
 * - Number of images validation
 */
export class GrokImageAdapter<
  TModel extends GrokImageModel,
> extends BaseImageAdapter<
  TModel,
  GrokImageProviderOptions,
  GrokImageModelProviderOptionsByName,
  GrokImageModelSizeByName,
  GrokImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'grok' as const

  protected client: OpenAI
  private readonly clientConfig: GrokImageConfig

  constructor(config: GrokImageConfig, model: TModel) {
    super(model, {})
    this.clientConfig = withGrokDefaults(config)
    this.client = new OpenAI(this.clientConfig)
  }

  async generateImages(
    options: ImageGenerationOptions<GrokImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, numberOfImages, size, modelOptions } = options

    const resolved = resolveMediaPrompt(options.prompt)
    const prompt = resolved.text

    if (resolved.videos.length > 0 || resolved.audios.length > 0) {
      throw new Error(
        `grok.generateImages does not support video / audio prompt parts on model ${model}.`,
      )
    }

    if (resolved.images.length > 0) {
      if (!isGrokImagineImageModel(model)) {
        throw new Error(
          `grok: model "${model}" does not support image prompt parts. ` +
            `Image-conditioned generation requires an Imagine API model ` +
            `('grok-imagine-image' or 'grok-imagine-image-quality').`,
        )
      }
      return await this.editImages(options, resolved)
    }

    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

    // grok-imagine models are aspect-ratio sized: the generic `size` option
    // carries an "aspectRatio_resolution" template (e.g. '16:9_2k', like
    // Gemini native image models) and maps to the Imagine API's
    // `aspect_ratio` / `resolution` parameters instead of OpenAI-style `size`.
    const isImagine = isGrokImagineImageModel(model)
    const request = {
      model,
      prompt,
      n: numberOfImages ?? 1,
      ...(isImagine
        ? imagineSizeParams(size)
        : size !== undefined && {
            size: size,
          }),
      stream: false,
      ...modelOptions,
    } as OpenAI_SDK.Images.ImageGenerateParamsNonStreaming

    try {
      options.logger.request(
        `activity=image provider=${this.name} model=${model} n=${request.n ?? 1} size=${request.size ?? 'default'}`,
        { provider: this.name, model },
      )
      const response = await this.client.images.generate(request)

      const images: Array<GeneratedImage> = (response.data ?? []).flatMap(
        (item): Array<GeneratedImage> => {
          const revisedPrompt = item.revised_prompt
          if (item.b64_json) {
            return [
              {
                b64Json: item.b64_json,
                ...(revisedPrompt !== undefined && { revisedPrompt }),
              },
            ]
          }
          if (item.url) {
            return [
              {
                url: item.url,
                ...(revisedPrompt !== undefined && { revisedPrompt }),
              },
            ]
          }
          return []
        },
      )

      const usage = buildImagesUsage(response.usage)

      return {
        id: generateId(this.name),
        model,
        images,
        ...(usage ? { usage } : {}),
      }
    } catch (error: unknown) {
      options.logger.errors(`${this.name}.generateImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateImages failed`),
        source: `${this.name}.generateImages`,
      })
      throw error
    }
  }

  /**
   * Image-conditioned generation via xAI's Imagine API.
   *
   * The `/v1/images/edits` endpoint takes `application/json` (the OpenAI
   * SDK's `images.edit()` sends `multipart/form-data`, which xAI rejects),
   * so this path issues the request directly. One input is sent as
   * `image: { url }`; multiple inputs (up to 3) as `images: [{ url }, ...]`,
   * addressed by xAI in the order they are sent. The prompt text is sent
   * verbatim — no referencing markers are injected.
   */
  private async editImages(
    options: ImageGenerationOptions<GrokImageProviderOptions>,
    resolved: ResolvedMediaPrompt,
  ): Promise<ImageGenerationResult> {
    const { model, numberOfImages, size, modelOptions, logger } = options
    const prompt = resolved.text
    const imageInputs = resolved.images

    const unsupportedRole = imageInputs.find(
      (part) =>
        part.metadata?.role === 'mask' || part.metadata?.role === 'control',
    )
    if (unsupportedRole) {
      throw new Error(
        `grok: the Imagine API has no ${unsupportedRole.metadata?.role} input; ` +
          `only source/reference images are supported.`,
      )
    }
    if (imageInputs.length > MAX_EDIT_IMAGES) {
      throw new Error(
        `grok: model "${model}" accepts at most ${MAX_EDIT_IMAGES} source images; received ${imageInputs.length}.`,
      )
    }

    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

    const urls = imageInputs.map((part) => imagePartToUrl(part))
    const request: Record<string, unknown> = {
      model,
      prompt,
      ...(urls.length === 1
        ? { image: { url: urls[0] } }
        : { images: urls.map((url) => ({ url })) }),
      ...(numberOfImages !== undefined && { n: numberOfImages }),
      ...imagineSizeParams(size),
      ...modelOptions,
    }

    try {
      logger.request(
        `activity=image provider=${this.name} model=${model} edit images=${urls.length}`,
        { provider: this.name, model },
      )

      const response = await fetch(
        `${this.clientConfig.baseURL}/images/edits`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.clientConfig.apiKey}`,
          },
          body: JSON.stringify(request),
        },
      )
      if (!response.ok) {
        const body = await response.text()
        throw new Error(
          `grok: image edit request failed (${response.status} ${response.statusText}): ${body}`,
        )
      }

      const result = (await response.json()) as GrokImageEditResponse
      const images: Array<GeneratedImage> = (result.data ?? []).flatMap(
        (item): Array<GeneratedImage> => {
          if (item.b64_json) return [{ b64Json: item.b64_json }]
          if (item.url) return [{ url: item.url }]
          return []
        },
      )
      if (images.length === 0) {
        throw new Error('grok: image edit response contained no images')
      }

      return {
        id: generateId(this.name),
        model,
        images,
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.generateImages fatal`, {
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
