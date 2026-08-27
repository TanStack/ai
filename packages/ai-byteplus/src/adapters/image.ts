import { resolveMediaPrompt } from '@tanstack/ai'
import { BaseImageAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import {
  bytePlusArkError,
  bytePlusArkHeaders,
  bytePlusTimeoutSignal,
  describeBody,
  getBytePlusArkApiKeyFromEnv,
  readJsonBody,
  toHeaderRecord,
  withBytePlusArkDefaults,
} from '../utils/client'
import {
  resolveBytePlusImageSize,
  resolveBytePlusSequentialImages,
  validateBytePlusImagePrompt,
  validateBytePlusReferenceImages,
} from '../image/image-provider-options'
import type {
  GeneratedImage,
  ImageGenerationOptions,
  ImageGenerationResult,
  ImagePart,
  MediaInputMetadata,
  TokenUsage,
} from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  BytePlusImageErrorObject,
  BytePlusImageGenerationRequest,
  BytePlusImageGenerationResponse,
  BytePlusImageUsage,
} from '../image/wire-types'
import type {
  BytePlusImageModelInputModalitiesByName,
  BytePlusImageModelProviderOptionsByName,
  BytePlusImageProviderOptions,
} from '../image/image-provider-options'
import type {
  BytePlusImageModel,
  BytePlusImageModelSizeByName,
} from '../model-meta'
import type { BytePlusArkConfig } from '../utils/client'

export interface BytePlusImageConfig extends BytePlusArkConfig {}

const SUPPORTED_INPUT_ROLES: ReadonlySet<string> = new Set([
  'reference',
  'character',
])

function imagePartToImageRef(part: ImagePart<MediaInputMetadata>): string {
  const { source } = part
  if (source.type === 'url') return source.value
  if (source.value.startsWith('data:')) return source.value
  return `data:${source.mimeType.toLowerCase()};base64,${source.value}`
}

function describeFailures(
  failures: ReadonlyArray<BytePlusImageErrorObject>,
): string {
  return failures
    .map((failure) =>
      [failure.code, failure.message].filter(Boolean).join(': '),
    )
    .filter((text) => text.length > 0)
    .join('; ')
}

function buildBytePlusImageUsage(
  usage: BytePlusImageUsage | undefined,
): TokenUsage | undefined {
  if (!usage) return undefined

  const completionTokens = usage.output_tokens ?? 0
  return {
    promptTokens: 0,
    completionTokens,
    totalTokens: usage.total_tokens ?? completionTokens,
    ...(usage.generated_images !== undefined && {
      billed: { quantity: usage.generated_images, unit: 'images' },
      unitsBilled: usage.generated_images,
    }),
  }
}

export class BytePlusImageAdapter<
  TModel extends BytePlusImageModel,
> extends BaseImageAdapter<
  TModel,
  BytePlusImageProviderOptions,
  BytePlusImageModelProviderOptionsByName,
  BytePlusImageModelSizeByName,
  BytePlusImageModelInputModalitiesByName
> {
  override readonly kind = 'image' as const
  readonly name = 'byteplus' as const

  /** Config with the Ark base URL resolved and trailing slashes trimmed. */
  private readonly clientConfig: Omit<BytePlusImageConfig, 'baseURL'> & {
    baseURL: string
  }

  constructor(model: TModel, config: BytePlusImageConfig) {
    super(model, {})
    this.clientConfig = withBytePlusArkDefaults(config)
  }

  async generateImages(
    options: ImageGenerationOptions<
      BytePlusImageProviderOptions,
      BytePlusImageModelSizeByName[TModel]
    >,
  ): Promise<ImageGenerationResult> {
    const { numberOfImages, size, modelOptions, logger } = options
    const model = this.model

    const resolved = resolveMediaPrompt(options.prompt)

    const hasUnsupportedMedia =
      resolved.videos.length > 0 || resolved.audios.length > 0
    if (hasUnsupportedMedia) {
      throw new Error(
        `byteplus.generateImages does not support video / audio prompt parts on model ${model}.`,
      )
    }

    const unsupportedRole = resolved.images.find(
      (part) =>
        part.metadata?.role !== undefined &&
        !SUPPORTED_INPUT_ROLES.has(part.metadata.role),
    )
    if (unsupportedRole) {
      throw new Error(
        `byteplus: Seedream has no ${unsupportedRole.metadata?.role} input; ` +
          `it accepts reference images only (${[...SUPPORTED_INPUT_ROLES].join(', ')}).`,
      )
    }

    validateBytePlusImagePrompt(model, resolved.text)
    validateBytePlusReferenceImages(model, resolved.images.length)

    const imageRefs = resolved.images.map(imagePartToImageRef)
    const request: BytePlusImageGenerationRequest = {
      ...(imageRefs.length > 0 && { image: imageRefs }),
      ...(size !== undefined && {
        size: resolveBytePlusImageSize(size),
      }),
      ...resolveBytePlusSequentialImages(model, numberOfImages),
      // Explicit provider options win over the values derived from the
      // generic options above (e.g. forcing `sequential_image_generation`).
      ...modelOptions,
      model,
      prompt: resolved.text,
    }

    try {
      logger.request(
        `activity=image provider=${this.name} model=${model} size=${request.size ?? 'default'} refs=${imageRefs.length}`,
        { provider: this.name, model },
      )

      const fetchImpl = this.clientConfig.fetch ?? fetch
      const signal = bytePlusTimeoutSignal(this.clientConfig.timeout)
      const response = await fetchImpl(
        `${this.clientConfig.baseURL}/images/generations`,
        {
          method: 'POST',
          ...(signal && { signal }),
          headers: bytePlusArkHeaders(
            this.clientConfig.apiKey,
            toHeaderRecord(this.clientConfig.defaultHeaders),
          ),
          body: JSON.stringify(request),
        },
      )

      const body = await readJsonBody(response)
      if (!response.ok) {
        throw bytePlusArkError(response.status, body, 'image generation')
      }

      return this.transformResponse(body, logger, numberOfImages)
    } catch (error: unknown) {
      logger.errors(`${this.name}.generateImages fatal`, {
        error: toRunErrorPayload(error, `${this.name}.generateImages failed`),
        source: `${this.name}.generateImages`,
      })
      throw error
    }
  }

  private transformResponse(
    body: unknown,
    logger: InternalLogger,
    numberOfImages: number | undefined,
  ): ImageGenerationResult {
    if (typeof body !== 'object' || body === null) {
      throw bytePlusArkError(
        200,
        body,
        'image generation returned a non-object body',
      )
    }
    const payload = body as BytePlusImageGenerationResponse

    const images: Array<GeneratedImage> = []
    const failures: Array<BytePlusImageErrorObject> = []
    let unrecognized = 0
    for (const item of payload.data ?? []) {
      if (item.b64_json) {
        images.push({ b64Json: item.b64_json })
      } else if (item.url) {
        images.push({ url: item.url })
      } else if (item.error) {
        // Group-image mode reports per-image failures alongside successes;
        // dropping them silently would make a short result look complete.
        failures.push(item.error)
      } else {
        unrecognized += 1
      }
    }
    if (payload.error) failures.push(payload.error)

    if (unrecognized > 0) {
      logger.errors(
        `${this.name}.generateImages: ${unrecognized} response item(s) matched ` +
          `none of b64_json / url / error — the response shape may have changed.`,
        {
          source: `${this.name}.generateImages`,
          provider: this.name,
          model: this.model,
          body,
        },
      )
    }

    if (images.length === 0) {
      const detail =
        describeFailures(failures) ||
        (unrecognized > 0
          ? `${unrecognized} unrecognized response item(s): ${describeBody(body) ?? ''}`
          : '')
      throw new Error(
        `byteplus: image generation returned no images` +
          (detail ? `: ${detail}` : '.'),
      )
    }

    if (failures.length > 0) {
      logger.errors(
        `${this.name}.generateImages dropped ${failures.length} failed image(s): ${describeFailures(failures)}`,
        {
          source: `${this.name}.generateImages`,
          provider: this.name,
          model: this.model,
          failures,
        },
      )
      logger.warn(
        `byteplus: ${failures.length} of ${failures.length + images.length} ` +
          `images failed to generate; returning ${images.length}.`,
        { provider: this.name, model: this.model },
      )
    }

    if (numberOfImages !== undefined && images.length < numberOfImages) {
      logger.warn(
        `byteplus: requested ${numberOfImages} images, received ${images.length}. ` +
          `Seedream has no exact count — sequential_image_generation.max_images is ` +
          `an upper bound and the model decides how many the prompt warrants.`,
        { provider: this.name, model: this.model },
      )
    }

    const usage = buildBytePlusImageUsage(payload.usage)

    return {
      id: generateId(this.name),
      model: this.model,
      images,
      ...(usage ? { usage } : {}),
    }
  }
}

export function createBytePlusImage<TModel extends BytePlusImageModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<BytePlusImageConfig, 'apiKey'>,
): BytePlusImageAdapter<TModel> {
  return new BytePlusImageAdapter(model, { apiKey, ...config })
}

export function byteplusImage<TModel extends BytePlusImageModel>(
  model: TModel,
  config?: Omit<BytePlusImageConfig, 'apiKey'>,
): BytePlusImageAdapter<TModel> {
  return createBytePlusImage(model, getBytePlusArkApiKeyFromEnv(), config)
}
