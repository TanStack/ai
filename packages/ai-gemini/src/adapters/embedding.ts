import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'
import type { ContentEmbedding, EmbedContentConfig } from '@google/genai'
import type { GeminiClient } from '../client/index'
import type {
  GeminiEmbeddingModel,
  GeminiEmbeddingModelInputModalitiesByName,
  GeminiEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { GeminiEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { GeminiClientConfig } from '../utils/client'

/**
 * Largest number of inputs sent in one `embedContent` call. The Gemini API
 * rejects larger batches, so longer inputs are split into sequential requests.
 */
const GEMINI_MAX_BATCH_SIZE = 100

/**
 * Configuration for Gemini Embedding adapter
 */
export interface GeminiEmbeddingConfig extends GeminiClientConfig {}

/**
 * Gemini Embedding Adapter
 *
 * Tree-shakeable adapter for Gemini text embeddings.
 * Supports gemini-embedding-001.
 *
 * Features:
 * - Batch embedding (inputs are sent in requests of at most 100 texts)
 * - Matryoshka dimension reduction via the top-level `dimensions` option
 *   (mapped to the SDK's `outputDimensionality`)
 * - Task-type hints (`taskType`, `title`) via provider options
 */
export class GeminiEmbeddingAdapter<
  TModel extends GeminiEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  GeminiEmbeddingProviderOptions,
  GeminiEmbeddingModelProviderOptionsByName,
  GeminiEmbeddingModelInputModalitiesByName
> {
  readonly name = 'gemini' as const

  protected client: GeminiClient

  constructor(config: GeminiEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = createGeminiClient(config)
  }

  async createEmbeddings(
    options: EmbeddingOptions<GeminiEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    try {
      // Build the config incrementally so possibly-undefined values are never
      // assigned to optional fields (exactOptionalPropertyTypes).
      const config: EmbedContentConfig = {}
      if (options.dimensions !== undefined) {
        config.outputDimensionality = options.dimensions
      }
      if (modelOptions?.taskType !== undefined) {
        config.taskType = modelOptions.taskType
      }
      if (modelOptions?.title !== undefined) {
        config.title = modelOptions.title
      }
      if (options.abortSignal) {
        config.abortSignal = options.abortSignal
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const embeddings: Array<ContentEmbedding> = []
      let billableCharacters: number | undefined
      for (
        let start = 0;
        start < texts.length;
        start += GEMINI_MAX_BATCH_SIZE
      ) {
        const batch = texts.slice(start, start + GEMINI_MAX_BATCH_SIZE)
        const response = await this.client.models.embedContent({
          model,
          contents: batch,
          config,
        })

        const batchEmbeddings = response.embeddings
        if (!batchEmbeddings || batchEmbeddings.length !== batch.length) {
          throw new Error(
            `Gemini embedContent returned ${batchEmbeddings ? batchEmbeddings.length : 'no'} embeddings for ${batch.length} inputs (model: ${model}).`,
          )
        }
        embeddings.push(...batchEmbeddings)

        const batchCharacters = response.metadata?.billableCharacterCount
        if (batchCharacters !== undefined) {
          billableCharacters = (billableCharacters ?? 0) + batchCharacters
        }
      }

      // Only Vertex reports usage (per-input token counts and billable
      // characters). The Developer API reports none, so `usage` is omitted.
      const tokenCounts = embeddings.flatMap(
        (embedding) => embedding.statistics?.tokenCount ?? [],
      )
      const tokens = tokenCounts.reduce((sum, count) => sum + count, 0)
      const hasUsage =
        tokenCounts.length > 0 || billableCharacters !== undefined
      return {
        id: generateId(this.name),
        model,
        embeddings: embeddings.map((embedding, index) => ({
          vector: embedding.values ?? [],
          index,
        })),
        ...(hasUsage && {
          usage: {
            promptTokens: tokens,
            completionTokens: 0,
            totalTokens: tokens,
            ...(billableCharacters !== undefined && {
              billed: { quantity: billableCharacters, unit: 'characters' },
            }),
          },
        }),
      }
    } catch (error: unknown) {
      logger.errors(`${this.name}.createEmbeddings fatal`, {
        error: toRunErrorPayload(error, `${this.name}.createEmbeddings failed`),
        source: `${this.name}.createEmbeddings`,
      })
      throw error
    }
  }
}

/**
 * Creates a Gemini embedding adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'gemini-embedding-001')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini embedding adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGeminiEmbedding('gemini-embedding-001', "your-api-key");
 *
 * const result = await embed({
 *   adapter,
 *   input: 'a red guitar'
 * });
 * ```
 */
export function createGeminiEmbedding<TModel extends GeminiEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiEmbeddingConfig, 'apiKey'>,
): GeminiEmbeddingAdapter<TModel> {
  // Put apiKey LAST so caller-supplied config can't silently override the
  // explicit argument.
  return new GeminiEmbeddingAdapter({ ...config, apiKey }, model)
}

/**
 * Creates a Gemini embedding adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gemini-embedding-001')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini embedding adapter instance with resolved types
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses GOOGLE_API_KEY from environment
 * const adapter = geminiEmbedding('gemini-embedding-001');
 *
 * const result = await embed({
 *   adapter,
 *   input: ['a red guitar', 'a blue drum kit'],
 *   dimensions: 1536
 * });
 *
 * console.log(result.embeddings[0].vector)
 * ```
 */
export function geminiEmbedding<TModel extends GeminiEmbeddingModel>(
  model: TModel,
  config?: Omit<GeminiEmbeddingConfig, 'apiKey'>,
): GeminiEmbeddingAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiEmbedding(model, apiKey, config)
}
