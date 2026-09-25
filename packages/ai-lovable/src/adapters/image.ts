import OpenAI from 'openai'
import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { buildImagesUsage } from '@tanstack/openai-base'
import { generateId } from '@tanstack/ai-utils'
import {
  getLovableApiKeyFromEnv,
  openaiRequestOptions,
  withLovableDefaults,
} from '../utils/client'
import { imagePartToFile } from '../image/image-input-to-file'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePart,
  MediaInputMetadata,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  LovableImageModel,
  LovableImageModelInputModalitiesByName,
  LovableImageModelProviderOptionsByName,
  LovableImageModelSizeByName,
} from '../model-meta'
import type { LovableImageProviderOptions } from '../image/image-provider-options'
import type { LovableClientConfig } from '../utils/client'

const MAX_EDIT_IMAGES = 16

export interface LovableImageConfig extends LovableClientConfig {
  /**
   * Opt into fetching HTTP(S) image URL inputs for image edits. The gateway
   * `/images/edits` endpoint requires uploaded file bytes, so an HTTP(S) URL
   * has to be downloaded and buffered in memory. When `false` (the default),
   * HTTP(S) URL image inputs throw.
   */
  allowUrlFetch?: boolean
}

function supportsImageMask(model: string): boolean {
  return model.startsWith('openai/')
}

function generatedImagesFromResponse(
  data:
    | Array<{
        b64_json?: string | null
        url?: string | null
        revised_prompt?: string | null
      }>
    | undefined
    | null,
  emptyMessage: string,
): Array<GeneratedImage> {
  const images: Array<GeneratedImage> = (data ?? []).flatMap(
    (item): Array<GeneratedImage> => {
      const revisedPromptField =
        item.revised_prompt !== undefined && item.revised_prompt !== null
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

  if (images.length === 0) {
    throw new Error(emptyMessage)
  }

  return images
}

export class LovableImageAdapter<
  TModel extends LovableImageModel,
> extends BaseImageAdapter<
  TModel,
  LovableImageProviderOptions,
  LovableImageModelProviderOptionsByName,
  LovableImageModelSizeByName,
  LovableImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'lovable' as const

  protected client: OpenAI
  private readonly allowUrlFetch: boolean

  constructor(config: LovableImageConfig, model: TModel) {
    super(model, {})
    const { allowUrlFetch, ...clientOptions } = config
    this.client = new OpenAI(withLovableDefaults(clientOptions))
    this.allowUrlFetch = allowUrlFetch ?? false
  }

  async generateImages(
    options: ImageGenerationOptions<LovableImageProviderOptions>,
  ): Promise<ImageGenerationResult> {
    const { model, numberOfImages, size, modelOptions } = options
    const resolved = resolveMediaPrompt(options.prompt)
    const prompt = resolved.text

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
        model,
        prompt,
        numberOfImages,
        size,
        modelOptions,
        imageInputs: resolved.images,
        logger: options.logger,
        abortSignal: options.abortSignal,
      })
    }

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
      const response = await this.client.images.generate(
        {
          ...request,
          stream: false,
        },
        openaiRequestOptions(options.abortSignal),
      )

      const images = generatedImagesFromResponse(
        response.data,
        `${this.name}: image response contained no images`,
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

  private async editImages(args: {
    model: string
    prompt: string
    numberOfImages?: number
    size?: string
    modelOptions?: LovableImageProviderOptions
    imageInputs: ReadonlyArray<ImagePart<MediaInputMetadata>>
    logger: ImageGenerationOptions<LovableImageProviderOptions>['logger']
    abortSignal?: AbortSignal
  }): Promise<ImageGenerationResult> {
    const {
      model,
      prompt,
      numberOfImages,
      size,
      modelOptions,
      logger,
      abortSignal,
    } = args

    const maskParts = args.imageInputs.filter(
      (part) => part.metadata?.role === 'mask',
    )
    const sourceParts = args.imageInputs.filter(
      (part) => part.metadata?.role !== 'mask',
    )

    if (maskParts.length > 0 && !supportsImageMask(model)) {
      throw new Error(
        `${this.name}: model "${model}" does not support mask image parts. Use an openai/ image model for masked edits.`,
      )
    }
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
    if (sourceParts.length > MAX_EDIT_IMAGES) {
      throw new Error(
        `${this.name}: model "${model}" accepts at most ${MAX_EDIT_IMAGES} source image(s); received ${sourceParts.length}.`,
      )
    }

    const sourceFiles = await Promise.all(
      sourceParts.map((part, i) =>
        imagePartToFile(part, `source-${i}`, this.allowUrlFetch, abortSignal),
      ),
    )
    const [firstSourceFile] = sourceFiles
    const maskFile = maskParts[0]
      ? await imagePartToFile(
          maskParts[0],
          'mask',
          this.allowUrlFetch,
          abortSignal,
        )
      : undefined

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
      const response = await this.client.images.edit(
        request,
        openaiRequestOptions(abortSignal),
      )

      const images = generatedImagesFromResponse(
        response.data,
        `${this.name}: image edit response contained no images`,
      )
      const usage = buildImagesUsage(response.usage)

      return {
        id: generateId(this.name),
        model,
        images,
        ...(usage ? { usage } : {}),
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

export function createLovableImage<TModel extends LovableImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<LovableImageConfig, 'apiKey'>,
): LovableImageAdapter<TModel> {
  return new LovableImageAdapter({ apiKey, ...config }, model)
}

export function lovableImage<TModel extends LovableImageModel>(
  model: TModel,
  config?: Omit<LovableImageConfig, 'apiKey'>,
): LovableImageAdapter<TModel> {
  return createLovableImage(model, getLovableApiKeyFromEnv(), config)
}
