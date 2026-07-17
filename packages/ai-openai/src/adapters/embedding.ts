import OpenAI from 'openai'
import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type {
  OpenAIEmbeddingModel,
  OpenAIEmbeddingModelInputModalitiesByName,
  OpenAIEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { OpenAIEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI Embedding adapter
 */
export interface OpenAIEmbeddingConfig extends OpenAIClientConfig {}

/**
 * OpenAI Embedding Adapter
 *
 * Tree-shakeable adapter for OpenAI text embeddings.
 * Supports text-embedding-3-small and text-embedding-3-large.
 *
 * Features:
 * - Batch embedding (one request for the whole input array)
 * - Matryoshka dimension reduction via the top-level `dimensions` option
 */
export class OpenAIEmbeddingAdapter<
  TModel extends OpenAIEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  OpenAIEmbeddingProviderOptions,
  OpenAIEmbeddingModelProviderOptionsByName,
  OpenAIEmbeddingModelInputModalitiesByName
> {
  readonly name = 'openai' as const

  protected client: OpenAI

  constructor(config: OpenAIEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = new OpenAI(config)
  }

  async createEmbeddings(
    options: EmbeddingOptions<OpenAIEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    try {
      // Spread modelOptions first so it can never override the validated
      // fields (server routes often pass modelOptions through from untyped
      // client input). encoding_format is pinned to float so vectors are
      // always number[].
      const request: OpenAI_SDK.EmbeddingCreateParams = {
        ...modelOptions,
        model,
        input: texts,
        encoding_format: 'float',
      }
      if (options.dimensions !== undefined) {
        request.dimensions = options.dimensions
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const response = await this.client.embeddings.create(request)

      const usage: TokenUsage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: 0,
        totalTokens: response.usage.total_tokens,
      }

      return {
        id: generateId(this.name),
        model,
        embeddings: response.data.map((item) => ({
          vector: item.embedding,
          index: item.index,
        })),
        usage,
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
 * Creates an OpenAI embedding adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'text-embedding-3-small')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI embedding adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiEmbedding('text-embedding-3-small', "sk-...");
 *
 * const result = await embed({
 *   adapter,
 *   input: 'a red guitar'
 * });
 * ```
 */
export function createOpenaiEmbedding<TModel extends OpenAIEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAIEmbeddingConfig, 'apiKey'>,
): OpenAIEmbeddingAdapter<TModel> {
  return new OpenAIEmbeddingAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI embedding adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'text-embedding-3-small')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI embedding adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiEmbedding('text-embedding-3-large');
 *
 * const result = await embed({
 *   adapter,
 *   input: ['a red guitar', 'a blue drum kit'],
 *   dimensions: 1024
 * });
 *
 * console.log(result.embeddings[0].vector)
 * ```
 */
export function openaiEmbedding<TModel extends OpenAIEmbeddingModel>(
  model: TModel,
  config?: Omit<OpenAIEmbeddingConfig, 'apiKey'>,
): OpenAIEmbeddingAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiEmbedding(model, apiKey, config)
}
