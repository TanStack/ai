import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import {
  createMistralClient,
  generateId,
  getMistralApiKeyFromEnv,
} from '../utils/client'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type { Mistral } from '@mistralai/mistralai'
import type { EmbeddingRequest } from '@mistralai/mistralai/models/components'
import type {
  MistralEmbeddingModel,
  MistralEmbeddingModelInputModalitiesByName,
  MistralEmbeddingModelProviderOptionsByName,
} from '../model-meta'
import type { MistralEmbeddingProviderOptions } from '../embedding/embedding-provider-options'
import type { MistralClientConfig } from '../utils/client'

/**
 * Configuration for Mistral embedding adapter.
 */
export type MistralEmbeddingConfig = MistralClientConfig

/**
 * Mistral Embedding Adapter
 *
 * Tree-shakeable adapter for Mistral text embeddings.
 * Supports mistral-embed and codestral-embed.
 *
 * Features:
 * - Batch embedding (one request for the whole input array)
 * - Dimension reduction for codestral-embed via the top-level `dimensions`
 *   option (mapped to Mistral's `outputDimension`); mistral-embed has a fixed
 *   1024-dimension output and rejects `dimensions`.
 */
export class MistralEmbeddingAdapter<
  TModel extends MistralEmbeddingModel,
> extends BaseEmbeddingAdapter<
  TModel,
  MistralEmbeddingProviderOptions,
  MistralEmbeddingModelProviderOptionsByName,
  MistralEmbeddingModelInputModalitiesByName
> {
  readonly name = 'mistral' as const

  protected client: Mistral

  constructor(config: MistralEmbeddingConfig, model: TModel) {
    super(model, {})
    this.client = createMistralClient(config)
  }

  async createEmbeddings(
    options: EmbeddingOptions<MistralEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    if (options.dimensions !== undefined && model === 'mistral-embed') {
      throw new Error(
        'mistral-embed does not support requesting dimensions (output is a fixed 1024-dimension vector). Use codestral-embed for dimension reduction, or omit `dimensions`.',
      )
    }

    try {
      // Spread modelOptions first so it can never override the validated
      // fields (server routes often pass modelOptions through from untyped
      // client input).
      const request: EmbeddingRequest = {
        ...modelOptions,
        model,
        inputs: texts,
      }
      if (options.dimensions !== undefined) {
        request.outputDimension = options.dimensions
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const response = await this.client.embeddings.create(request)

      const usage: TokenUsage = {
        promptTokens: response.usage.promptTokens ?? 0,
        completionTokens: 0,
        totalTokens: response.usage.totalTokens ?? 0,
      }

      return {
        id: generateId(this.name),
        model,
        // Mistral returns one entry per input; `index` is optional in the SDK
        // types, so fall back to array order when it's absent.
        embeddings: response.data.map((item, arrayIndex) => ({
          vector: item.embedding ?? [],
          index: item.index ?? arrayIndex,
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
 * Creates a Mistral embedding adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'mistral-embed')
 * @param apiKey - Your Mistral API key
 * @param config - Optional additional configuration
 * @returns Configured Mistral embedding adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createMistralEmbedding('mistral-embed', 'api_key');
 *
 * const result = await embed({
 *   adapter,
 *   input: 'a red guitar'
 * });
 * ```
 */
export function createMistralEmbedding<TModel extends MistralEmbeddingModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<MistralEmbeddingConfig, 'apiKey'>,
): MistralEmbeddingAdapter<TModel> {
  return new MistralEmbeddingAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Mistral embedding adapter using the `MISTRAL_API_KEY` environment variable.
 * Type resolution happens here at the call site.
 *
 * Looks for `MISTRAL_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'codestral-embed')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Mistral embedding adapter instance with resolved types
 * @throws Error if MISTRAL_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses MISTRAL_API_KEY from environment
 * const adapter = mistralEmbedding('codestral-embed');
 *
 * const result = await embed({
 *   adapter,
 *   input: ['a red guitar', 'a blue drum kit'],
 *   dimensions: 256
 * });
 *
 * console.log(result.embeddings[0].vector)
 * ```
 */
export function mistralEmbedding<TModel extends MistralEmbeddingModel>(
  model: TModel,
  config?: Omit<MistralEmbeddingConfig, 'apiKey'>,
): MistralEmbeddingAdapter<TModel> {
  const apiKey = getMistralApiKeyFromEnv()
  return createMistralEmbedding(model, apiKey, config)
}
