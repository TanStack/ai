import { requireTextOnlyEmbeddingInput } from '@tanstack/ai'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { generateId } from '@tanstack/ai-utils'
import { createOllamaClient, getOllamaHostFromEnv } from '../utils'
import type { OllamaClientConfig } from '../utils/client'
import type { EmbedRequest, EmbedResponse, Ollama } from 'ollama'
import type {
  EmbeddingOptions,
  EmbeddingResult,
  TokenUsage,
} from '@tanstack/ai'
import type { OllamaEmbeddingModel } from '../model-meta'
import type { OllamaEmbeddingProviderOptions } from '../embedding/embedding-provider-options'

/**
 * Configuration for the Ollama Embedding adapter.
 * Ollama has no API key — only an optional host (and headers).
 */
export interface OllamaEmbeddingConfig extends OllamaClientConfig {}

/**
 * Extract `prompt_eval_count` through an optional-field view of the response.
 * The Ollama SDK types it as required, but servers can omit it at runtime;
 * widening here keeps the presence check honest without any casts.
 */
function extractPromptEvalCount(response: {
  prompt_eval_count?: number
}): number | undefined {
  return response.prompt_eval_count
}

/**
 * Ollama Embedding Adapter
 *
 * Tree-shakeable adapter for Ollama text embeddings (`/api/embed`).
 *
 * Notes:
 * - Batch embedding: one request for the whole input array.
 * - Ollama models are loaded dynamically, so any model name string is
 *   accepted; `OLLAMA_EMBEDDING_MODELS` lists common embedding models.
 * - Ollama does not support requesting embedding dimensions, so the
 *   top-level `dimensions` option is rejected.
 */
export class OllamaEmbeddingAdapter<
  TModel extends OllamaEmbeddingModel,
> extends BaseEmbeddingAdapter<TModel, OllamaEmbeddingProviderOptions> {
  readonly name = 'ollama' as const

  protected client: Ollama

  constructor(
    hostOrClientOrConfig: string | Ollama | OllamaEmbeddingConfig | undefined,
    model: TModel,
  ) {
    super(model, {})
    if (
      typeof hostOrClientOrConfig === 'string' ||
      hostOrClientOrConfig === undefined
    ) {
      this.client = createOllamaClient({ host: hostOrClientOrConfig })
    } else if ('embed' in hostOrClientOrConfig) {
      // Ollama client instance (has an embed method)
      this.client = hostOrClientOrConfig
    } else {
      // OllamaEmbeddingConfig object
      this.client = createOllamaClient(hostOrClientOrConfig)
    }
  }

  async createEmbeddings(
    options: EmbeddingOptions<OllamaEmbeddingProviderOptions>,
  ): Promise<EmbeddingResult> {
    const { model, logger, modelOptions } = options
    const texts = requireTextOnlyEmbeddingInput(options.input, this.name, model)

    if (options.dimensions !== undefined) {
      throw new Error('Ollama does not support requesting embedding dimensions')
    }

    try {
      // Built incrementally so optional keys are omitted entirely when unset
      // (exactOptionalPropertyTypes). Provider options use camelCase
      // (`keepAlive`) and are mapped to the SDK's snake_case wire fields.
      const request: EmbedRequest = {
        model,
        input: texts,
      }
      if (modelOptions?.truncate !== undefined) {
        request.truncate = modelOptions.truncate
      }
      if (modelOptions?.keepAlive !== undefined) {
        request.keep_alive = modelOptions.keepAlive
      }
      if (modelOptions?.options !== undefined) {
        // Spread a fresh object to avoid aliasing the caller's options.
        request.options = { ...modelOptions.options }
      }

      logger.request(
        `activity=embed provider=${this.name} model=${model} inputs=${texts.length}`,
        { provider: this.name, model },
      )

      const response: EmbedResponse = await this.client.embed(request)

      // Include usage only when Ollama actually reported a prompt token count.
      const promptEvalCount = extractPromptEvalCount(response)
      const usage: TokenUsage | undefined =
        promptEvalCount !== undefined
          ? {
              promptTokens: promptEvalCount,
              completionTokens: 0,
              totalTokens: promptEvalCount,
            }
          : undefined

      return {
        id: generateId(this.name),
        model,
        embeddings: response.embeddings.map((vector, index) => ({
          vector,
          index,
        })),
        ...(usage !== undefined && { usage }),
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
 * Creates an Ollama embedding adapter with explicit host (or client config).
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'nomic-embed-text')
 * @param hostOrConfig - Ollama host URL or client config (defaults to http://localhost:11434)
 * @returns Configured Ollama embedding adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOllamaEmbedding('nomic-embed-text', 'http://localhost:11434');
 *
 * const result = await embed({
 *   adapter,
 *   input: 'a red guitar'
 * });
 * ```
 */
export function createOllamaEmbedding<TModel extends OllamaEmbeddingModel>(
  model: TModel,
  hostOrConfig?: string | OllamaEmbeddingConfig,
): OllamaEmbeddingAdapter<TModel> {
  return new OllamaEmbeddingAdapter(hostOrConfig, model)
}

/**
 * Creates an Ollama embedding adapter with host from the `OLLAMA_HOST`
 * environment variable (falling back to the Ollama default).
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'nomic-embed-text')
 * @returns Configured Ollama embedding adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = ollamaEmbedding('mxbai-embed-large');
 *
 * const result = await embed({
 *   adapter,
 *   input: ['a red guitar', 'a blue drum kit']
 * });
 *
 * console.log(result.embeddings[0].vector)
 * ```
 */
export function ollamaEmbedding<TModel extends OllamaEmbeddingModel>(
  model: TModel,
): OllamaEmbeddingAdapter<TModel> {
  const host = getOllamaHostFromEnv()
  return new OllamaEmbeddingAdapter(host, model)
}
