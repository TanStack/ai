import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { arrayBufferToBase64, generateId } from '@tanstack/ai-utils'
import { resolveEmbeddingInput } from '@tanstack/ai'
import { getCohereApiKeyFromEnv } from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  ImagePart,
  TokenUsage,
} from '@tanstack/ai'
import type {
  CohereEmbeddingModel,
  CohereEmbeddingModelInputModalitiesByName,
  CohereEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { CohereEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { CohereClientConfig } from '../utils/client'

export interface CohereEmbeddingConfig extends CohereClientConfig {}

const DEFAULT_BASE_URL = 'https://api.cohere.com'
const DEFAULT_TIMEOUT_MS = 30_000

function isPrivateOrInternalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  const notHttp = parsed.protocol !== 'http:' && parsed.protocol !== 'https:'
  if (notHttp) {
    return true
  }
  const host = parsed.hostname.toLowerCase()
  const isPrivateHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '[::1]' ||
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  if (isPrivateHost) {
    return true
  }
  return false
}

async function readCohereErrorMessage(response: Response): Promise<string> {
  const bodyText = await response.text()
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'message' in parsed &&
      typeof parsed.message === 'string'
    ) {
      return parsed.message
    }
  } catch {
    // Not JSON — fall back to the raw body text.
  }
  return bodyText
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

/** One content part of a Cohere v2/embed fused input. */
type CohereEmbedContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** Wire shape of the Cohere v2/embed request body. */
interface CohereEmbedRequestBody {
  model: string
  inputs: Array<{ content: Array<CohereEmbedContentPart> }>
  input_type: CohereEmbeddingProviderOptions['inputType']
  embedding_types: ['float']
  truncate?: 'NONE' | 'START' | 'END'
  output_dimension?: number
}

/** Wire shape of the Cohere v2/embed response (fields the adapter reads). */
interface CohereEmbedResponse {
  id?: string
  embeddings?: {
    float?: Array<Array<number>>
  }
  meta?: {
    billed_units?: {
      input_tokens?: number
      images?: number
    }
  }
}

export class CohereEmbeddingAdapter<
  TModel extends CohereEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  CohereEmbeddingProviderOptions,
  CohereEmbeddingModelProviderOptionsByName,
  CohereEmbeddingModelInputModalitiesByName
> {
  readonly name = 'cohere' as const

  protected clientConfig: CohereEmbeddingConfig

  constructor(config: CohereEmbeddingConfig, model: TModel) {
    super(model, {})
    this.clientConfig = config
  }

  async createEmbeddings(
    options: EmbeddingOptions<CohereEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options

    try {
      // The provider options type makes `modelOptions` required at the
      // embed() call site; this guard covers untyped/dynamic callers.
      const inputType: CohereEmbeddingProviderOptions['inputType'] | undefined =
        modelOptions?.inputType
      if (!inputType) {
        throw new Error(
          `Cohere embeddings require modelOptions.inputType ('search_document' | 'search_query' | 'classification' | 'clustering').`,
        )
      }

      const inputs = await this.toCohereInputs(
        resolveEmbeddingInput(options.input),
      )

      // embedding_types is pinned to ['float'] (overriding any disagreeing
      // modelOptions.embeddingTypes) so vectors are always number[].
      const body: CohereEmbedRequestBody = {
        model,
        inputs,
        input_type: inputType,
        embedding_types: ['float'],
      }
      const truncate = modelOptions?.truncate
      if (truncate !== undefined) {
        body.truncate = truncate
      }
      if (options.dimensions !== undefined) {
        body.output_dimension = options.dimensions
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${inputs.length}`,
        { provider: this.name, model },
      )

      const timeoutMs = this.clientConfig.timeout ?? DEFAULT_TIMEOUT_MS
      const response = await fetchWithTimeout(
        `${this.clientConfig.baseUrl ?? DEFAULT_BASE_URL}/v2/embed`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.clientConfig.apiKey}`,
            'Content-Type': 'application/json',
            ...this.clientConfig.headers,
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
      )

      if (!response.ok) {
        throw new Error(
          `Cohere embed failed (${response.status}): ${await readCohereErrorMessage(response)}`,
        )
      }

      const data = (await response.json()) as CohereEmbedResponse

      const vectors = data.embeddings?.float
      if (!vectors) {
        throw new Error(
          'Cohere embed response did not include float embeddings',
        )
      }
      if (vectors.length !== inputs.length) {
        throw new Error(
          `Cohere embed returned ${vectors.length} embeddings for ${inputs.length} inputs`,
        )
      }

      const result: EmbeddingResult = {
        id: generateId(this.name),
        model,
        embeddings: vectors.map((vector, index) => ({ vector, index })),
      }

      const inputTokens = data.meta?.billed_units?.input_tokens
      if (inputTokens !== undefined) {
        const usage: TokenUsage = {
          promptTokens: inputTokens,
          completionTokens: 0,
          totalTokens: inputTokens,
        }
        result.usage = usage
      }

      return result
    } catch (error: unknown) {
      logger.errors(`${this.name}.createEmbeddings fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createEmbeddings failed`),
        source: `${this.name}.createEmbeddings`,
      })
      throw error
    }
  }

  private async toCohereInputs(
    resolved: ReturnType<typeof resolveEmbeddingInput>,
  ): Promise<Array<{ content: Array<CohereEmbedContentPart> }>> {
    return Promise.all(
      resolved.map(async (item) => {
        const content: Array<CohereEmbedContentPart> = item.texts.map(
          (text) => ({ type: 'text', text }),
        )
        for (const image of item.images) {
          content.push({
            type: 'image_url',
            image_url: { url: await this.resolveImageUrl(image) },
          })
        }
        return { content }
      }),
    )
  }

  protected async resolveImageUrl(image: ImagePart): Promise<string> {
    const source = image.source

    if (source.type === 'data') {
      return `data:${source.mimeType};base64,${source.value}`
    }

    if (source.value.startsWith('data:')) {
      return source.value
    }

    if (!this.clientConfig.allowUrlFetch) {
      throw new Error(
        'Cohere does not fetch remote image URLs; pass base64 data or a data: URI (or enable config.allowUrlFetch to have the adapter download it)',
      )
    }

    if (isPrivateOrInternalUrl(source.value)) {
      throw new Error(
        `Refusing to fetch internal or private URL for Cohere embedding: ${source.value}`,
      )
    }

    const response = await fetchWithTimeout(
      source.value,
      undefined,
      this.clientConfig.timeout ?? DEFAULT_TIMEOUT_MS,
    )
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image URL for Cohere embedding (${response.status}): ${source.value}`,
      )
    }
    const mimeType =
      response.headers.get('content-type') ??
      source.mimeType ??
      'application/octet-stream'
    const base64 = arrayBufferToBase64(await response.arrayBuffer())
    return `data:${mimeType};base64,${base64}`
  }
}

export function createCohereEmbedding<TModel extends CohereEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<CohereEmbeddingConfig, 'apiKey'>,
): CohereEmbeddingAdapter<TModel> {
  return new CohereEmbeddingAdapter({ apiKey, ...config }, model)
}

export function cohereEmbedding<TModel extends CohereEmbeddingModel>(
  model: TModel,
  config?: Omit<CohereEmbeddingConfig, 'apiKey'>,
): CohereEmbeddingAdapter<TModel> {
  const apiKey = getCohereApiKeyFromEnv()
  return createCohereEmbedding(model, apiKey, config)
}
