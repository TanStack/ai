import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import {
  requireTextOnlyEmbeddingInput,
  resolveEmbeddingInput,
} from '@tanstack/ai'
import { resolveBedrockAuth } from '../utils/auth'
import { BEDROCK_EMBEDDING_MODELS } from '../model-meta'
import type * as BedrockRuntime from '@aws-sdk/client-bedrock-runtime'
import type {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-runtime'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  ImagePart,
  TokenUsage,
} from '@tanstack/ai'
import type { ResolvedBedrockAuth } from '../utils/auth'
import type { BedrockClientConfig } from '../utils/client'
import type {
  BedrockEmbeddingModel,
  BedrockEmbeddingModelInputModalitiesByName,
  BedrockEmbeddingModelProviderOptionsByName,
  ResolveEmbeddingProviderOptions,
} from '../model-meta'

export interface BedrockEmbeddingConfig extends Pick<
  BedrockClientConfig,
  'apiKey' | 'region' | 'auth' | 'baseURL'
> {}

/** InvokeModel calls issued concurrently during a per-item fan-out. */
const MAX_CONCURRENT_INVOCATIONS = 5

/** Valid `dimensions` for `amazon.titan-embed-text-v2:0`. */
const TITAN_TEXT_DIMENSIONS: ReadonlyArray<number> = [256, 512, 1024]

/** Valid `dimensions` (outputEmbeddingLength) for `amazon.titan-embed-image-v1`. */
const TITAN_IMAGE_DIMENSIONS: ReadonlyArray<number> = [256, 384, 1024]
const TITAN_IMAGE_DEFAULT_DIMENSIONS = 1024

/** Cohere embed accepts at most 96 texts per InvokeModel call. */
const COHERE_MAX_BATCH_SIZE = 96

export class BedrockEmbeddingAdapter<
  TModel extends BedrockEmbeddingModel,
  TProviderOptions extends Record<string, any> =
    ResolveEmbeddingProviderOptions<TModel>,
> extends BaseEmbeddingAdapter<
  TModel,
  TProviderOptions,
  BedrockEmbeddingModelProviderOptionsByName,
  BedrockEmbeddingModelInputModalitiesByName
> {
  readonly name = 'bedrock' as const
  private clientPromise?: Promise<BedrockRuntimeClient>
  private readonly clientConfig: BedrockEmbeddingConfig

  constructor(config: BedrockEmbeddingConfig, model: TModel) {
    super(model, {})
    this.clientConfig = config
  }

  protected importBedrockRuntime(): Promise<typeof BedrockRuntime> {
    const mod = '@aws-sdk/client-bedrock-runtime'
    return import(/* @vite-ignore */ mod) as Promise<typeof BedrockRuntime>
  }

  protected async getClient(): Promise<BedrockRuntimeClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { BedrockRuntimeClient } = await this.importBedrockRuntime()
        const region = this.clientConfig.region ?? 'us-east-1'
        const resolved = resolveBedrockAuth(
          {
            apiKey: this.clientConfig.apiKey,
            region,
            auth: this.clientConfig.auth,
          },
          'runtime',
        )
        return new BedrockRuntimeClient(
          this.buildClientConfig(resolved, region, this.clientConfig.baseURL),
        )
      })().catch((error: unknown) => {
        // Don't cache a rejected promise — clear it so a later call can retry
        // (e.g. after a transient import failure or fixed auth config).
        this.clientPromise = undefined
        throw error
      })
    }
    return this.clientPromise
  }

  protected buildClientConfig(
    resolved: ResolvedBedrockAuth,
    region: string,
    endpoint: string | undefined,
  ): BedrockRuntimeClientConfig {
    if (resolved.kind === 'bearer') {
      return {
        region,
        token: { token: resolved.token },
        authSchemePreference: ['httpBearerAuth'],
        ...(endpoint ? { endpoint } : {}),
      }
    }
    return {
      region: resolved.region,
      credentials: resolved.credentials,
      ...(endpoint ? { endpoint } : {}),
    }
  }

  /** Send one InvokeModel call and parse its JSON response body. */
  protected async invokeModel(
    modelId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const { InvokeModelCommand } = await this.importBedrockRuntime()
    const client = await this.getClient()
    const response = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      }),
    )
    return JSON.parse(new TextDecoder().decode(response.body))
  }

  async createEmbeddings(
    options: EmbeddingOptions<TProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger } = options
    try {
      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${options.input.length}`,
        { provider: this.name, model },
      )
      switch (model) {
        case 'amazon.titan-embed-text-v2:0':
          return await this.embedTitanText(options)
        case 'amazon.titan-embed-image-v1':
          return await this.embedTitanImage(options)
        case 'cohere.embed-english-v3':
        case 'cohere.embed-multilingual-v3':
          return await this.embedCohere(options)
        default:
          throw new Error(
            `Unknown Bedrock embedding model "${model}". Supported models: ` +
              `${BEDROCK_EMBEDDING_MODELS.join(', ')}.`,
          )
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.createEmbeddings fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createEmbeddings failed`),
        source: `${this.name}.createEmbeddings`,
      })
      throw error
    }
  }

  private async embedTitanText(
    options: EmbeddingOptions<TProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, dimensions } = options
    if (
      dimensions !== undefined &&
      !TITAN_TEXT_DIMENSIONS.includes(dimensions)
    ) {
      throw new Error(
        `${model} supports dimensions 256, 512, or 1024; got ${dimensions}`,
      )
    }
    const normalize: boolean | undefined = options.modelOptions?.normalize
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    const responses = await mapWithConcurrency(
      texts,
      MAX_CONCURRENT_INVOCATIONS,
      async (text) => {
        // Built incrementally: exactOptionalPropertyTypes is on, and Titan
        // rejects explicit nulls/undefined for absent optional fields.
        const body: Record<string, unknown> = { inputText: text }
        if (dimensions !== undefined) body.dimensions = dimensions
        if (normalize !== undefined) body.normalize = normalize
        return readTitanEmbeddingBody(
          await this.invokeModel(model, body),
          `${this.name} ${model}`,
        )
      },
    )

    return this.toTitanResult(model, responses)
  }

  private async embedTitanImage(
    options: EmbeddingOptions<TProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, dimensions } = options
    const outputEmbeddingLength = dimensions ?? TITAN_IMAGE_DEFAULT_DIMENSIONS
    if (!TITAN_IMAGE_DIMENSIONS.includes(outputEmbeddingLength)) {
      throw new Error(
        `${model} supports dimensions 256, 384, or 1024; got ${outputEmbeddingLength}`,
      )
    }
    const items = resolveEmbeddingInput(options.input)

    const responses = await mapWithConcurrency(
      items,
      MAX_CONCURRENT_INVOCATIONS,
      async (item, index) => {
        if (item.images.length > 1) {
          throw new Error(
            `${model} accepts at most one image per input item; input item ` +
              `at index ${index} contains ${item.images.length} images. ` +
              `Pass them as separate input items (one vector each).`,
          )
        }
        const body: Record<string, unknown> = {
          embeddingConfig: { outputEmbeddingLength },
        }
        if (item.texts.length > 0) body.inputText = item.texts.join('\n')
        const image = item.images[0]
        if (image) body.inputImage = toTitanInputImage(image, model)
        return readTitanEmbeddingBody(
          await this.invokeModel(model, body),
          `${this.name} ${model}`,
        )
      },
    )

    return this.toTitanResult(model, responses)
  }

  private async embedCohere(
    options: EmbeddingOptions<TProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, dimensions } = options
    if (dimensions !== undefined) {
      throw new Error(
        `${model} does not support the dimensions option; its output size is fixed`,
      )
    }
    const inputType: string | undefined = options.modelOptions?.inputType
    if (inputType === undefined) {
      throw new Error(
        `${model} requires modelOptions.inputType ('search_document' | ` +
          `'search_query' | 'classification' | 'clustering')`,
      )
    }
    const truncate: string | undefined = options.modelOptions?.truncate
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)
    const batches = chunk(texts, COHERE_MAX_BATCH_SIZE)

    const responses = await mapWithConcurrency(
      batches,
      MAX_CONCURRENT_INVOCATIONS,
      async (batch) => {
        const body: Record<string, unknown> = {
          texts: batch,
          input_type: inputType,
        }
        if (truncate !== undefined) body.truncate = truncate
        return readCohereEmbeddingBody(
          await this.invokeModel(model, body),
          `${this.name} ${model}`,
        )
      },
    )

    return {
      id: this.generateId(),
      model,
      embeddings: responses.flat().map((vector, index) => ({ vector, index })),
    }
  }

  /** Assemble an EmbeddingResult from per-item Titan responses. */
  private toTitanResult(
    model: string,
    responses: Array<TitanEmbeddingBody>,
  ): EmbeddingResult {
    let promptTokens = 0
    const embeddings = responses.map((response, index) => {
      promptTokens += response.inputTextTokenCount
      return { vector: response.embedding, index }
    })
    const usage: TokenUsage = {
      promptTokens,
      completionTokens: 0,
      totalTokens: promptTokens,
    }
    return { id: this.generateId(), model, embeddings, usage }
  }
}

interface TitanEmbeddingBody {
  embedding: Array<number>
  /** 0 when the response omits it (e.g. image-only Titan Multimodal calls). */
  inputTextTokenCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Narrow a Titan InvokeModel JSON body: `{ embedding, inputTextTokenCount? }`. */
function readTitanEmbeddingBody(
  raw: unknown,
  context: string,
): TitanEmbeddingBody {
  const embedding =
    isRecord(raw) && Array.isArray(raw.embedding) ? raw.embedding : undefined
  if (!embedding) {
    throw new Error(
      `${context}: response body is missing the "embedding" array`,
    )
  }
  const inputTextTokenCount =
    isRecord(raw) && typeof raw.inputTextTokenCount === 'number'
      ? raw.inputTextTokenCount
      : 0
  return { embedding, inputTextTokenCount }
}

/** Narrow a Cohere InvokeModel JSON body: `{ embeddings: number[][] }` (float). */
function readCohereEmbeddingBody(
  raw: unknown,
  context: string,
): Array<Array<number>> {
  const embeddings =
    isRecord(raw) && Array.isArray(raw.embeddings) ? raw.embeddings : undefined
  if (!embeddings) {
    throw new Error(
      `${context}: response body is missing the "embeddings" array`,
    )
  }
  return embeddings
}

function toTitanInputImage(image: ImagePart, model: string): string {
  const source = image.source
  if (source.type === 'data') {
    return source.value
  }
  if (source.value.startsWith('data:')) {
    const comma = source.value.indexOf(',')
    if (comma !== -1) {
      return source.value.slice(comma + 1)
    }
  }
  throw new Error(
    `Bedrock Titan does not fetch remote image URLs; pass base64 data ` +
      `(a { type: 'data' } source or a data: URI) for ${model}.`,
  )
}

/** Split into runs of at most `size`, preserving order. */
function chunk<T>(items: Array<T>, size: number): Array<Array<T>> {
  const chunks: Array<Array<T>> = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function mapWithConcurrency<T, TResult>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<TResult>,
): Promise<Array<TResult>> {
  const results = new Array<TResult>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      if (item === undefined) continue // unreachable: index < length
      results[index] = await fn(item, index)
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

export function createBedrockEmbedding<TModel extends BedrockEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<BedrockEmbeddingConfig, 'apiKey'>,
): BedrockEmbeddingAdapter<TModel> {
  // Explicit apiKey is authoritative — spread config first so it can't override.
  return new BedrockEmbeddingAdapter({ ...config, apiKey }, model)
}

export function bedrockEmbedding<TModel extends BedrockEmbeddingModel>(
  model: TModel,
  config?: BedrockEmbeddingConfig,
): BedrockEmbeddingAdapter<TModel> {
  return new BedrockEmbeddingAdapter(config ?? {}, model)
}
