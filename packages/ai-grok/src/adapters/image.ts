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

export interface GrokImageConfig extends GrokClientConfig {}

/** Maximum source images accepted by xAI's image edit endpoint. */
const MAX_EDIT_IMAGES = 3

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

    const hasUnsupportedPromptMedia =
      resolved.videos.length > 0 || resolved.audios.length > 0
    if (hasUnsupportedPromptMedia) {
      throw new Error(
        `grok.generateImages does not support video / audio prompt parts on model ${model}.`,
      )
    }

    if (resolved.images.length > 0) {
      if (!isGrokImagineImageModel(model)) {
        throw new Error(
          `grok: model "${model}" does not support image prompt parts. ` +
            `Image-conditioned generation requires an Imagine API model ` +
            `('grok-imagine-image', 'grok-imagine-image-2.0' or ` +
            `'grok-imagine-image-quality').`,
        )
      }
      return await this.editImages(options, resolved)
    }

    validatePrompt({ prompt, model })
    validateImageSize(model, size)
    validateNumberOfImages(model, numberOfImages)

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

export function createGrokImage<TModel extends GrokImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokImageConfig, 'apiKey'>,
): GrokImageAdapter<TModel> {
  return new GrokImageAdapter({ apiKey, ...config }, model)
}

export function grokImage<TModel extends GrokImageModel>(
  model: TModel,
  config?: Omit<GrokImageConfig, 'apiKey'>,
): GrokImageAdapter<TModel> {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrokImage(model, apiKey, config)
}
