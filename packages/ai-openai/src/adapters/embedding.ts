import { createOpenAIClient } from '@tanstack/openai-base'
import type {
  OpenAIClientLike,
  OpenaiPostEmbeddingsBody,
} from '@tanstack/openai-base'
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
 * The embeddings endpoint rejects requests with more than 2048 inputs, so
 * larger arrays are sent as several sequential requests.
 */
// ponytail: splits by input count only. OpenAI also caps a request at 300k
// tokens summed across inputs, so 2048 long texts can still 400. Add a
// token-budget split if that bites (needs a tokeniser or char estimate).
const OPENAI_MAX_BATCH_SIZE = 2048

/**
 * OpenAI Embedding Adapter
 *
 * Tree-shakeable adapter for OpenAI text embeddings.
 * Supports text-embedding-3-small and text-embedding-3-large.
 *
 * Features:
 * - Batch embedding (sequential requests of at most 2048 inputs each; usage is summed)
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

  protected client: OpenAIClientLike

  constructor(config: OpenAIEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = createOpenAIClient(config)
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
      const baseRequest = {
        ...modelOptions,
        model,
        encoding_format: 'float',
      } as const
      const dimensions =
        options.dimensions !== undefined
          ? { dimensions: options.dimensions }
          : {}

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const embeddings: EmbeddingResult['embeddings'] = []
      let promptTokens = 0
      let totalTokens = 0

      for (
        let start = 0;
        start < texts.length;
        start += OPENAI_MAX_BATCH_SIZE
      ) {
        const request: OpenaiPostEmbeddingsBody = {
          ...baseRequest,
          ...dimensions,
          input: texts.slice(start, start + OPENAI_MAX_BATCH_SIZE),
        }

        const response = options.abortSignal
          ? await this.client.embeddings.create(request, {
              signal: options.abortSignal,
            })
          : await this.client.embeddings.create(request)

        for (const item of response.data) {
          embeddings.push({ vector: item.embedding, index: start + item.index })
        }
        promptTokens += response.usage.prompt_tokens
        totalTokens += response.usage.total_tokens
      }

      const usage: TokenUsage = {
        promptTokens,
        completionTokens: 0,
        totalTokens,
      }

      return {
        id: generateId(this.name),
        model,
        embeddings,
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
