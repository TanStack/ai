import { BaseEmbeddingAdapter } from '@tanstack/ai/adapters'
import { OPENAI_EMBEDDING_MODELS } from '../model-meta'
import {
  createOpenAIClient,
  generateId,
  getOpenAIApiKeyFromEnv,
} from '../utils'
import type { EmbeddingOptions, EmbeddingResult } from '@tanstack/ai'
import type OpenAI_SDK from 'openai'
import type { OpenAIClientConfig } from '../utils'

/**
 * Configuration for OpenAI embedding adapter
 */
export interface OpenAIEmbedConfig extends OpenAIClientConfig {}

/**
 * OpenAI-specific provider options for embeddings
 * Based on OpenAI Embeddings API documentation
 * @see https://platform.openai.com/docs/api-reference/embeddings/create
 */
export interface OpenAIEmbedProviderOptions {
  /** Encoding format for embeddings: 'float' | 'base64' */
  encodingFormat?: 'float' | 'base64'
  /** Unique identifier for end-user (for abuse monitoring) */
  user?: string
}

/**
 * OpenAI Embedding Adapter
 *
 * Tree-shakeable adapter for OpenAI embedding functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class OpenAIEmbedAdapter extends BaseEmbeddingAdapter<
  typeof OPENAI_EMBEDDING_MODELS,
  OpenAIEmbedProviderOptions
> {
  readonly kind = 'embedding' as const
  readonly name = 'openai'
  readonly models = OPENAI_EMBEDDING_MODELS

  private client: OpenAI_SDK

  constructor(config: OpenAIEmbedConfig) {
    super({})
    this.client = createOpenAIClient(config)
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: options.model || 'text-embedding-ada-002',
      input: options.input,
      dimensions: options.dimensions,
    })

    return {
      id: generateId(this.name),
      model: response.model,
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    }
  }
}

/**
 * Creates an OpenAI embedding adapter with explicit API key
 *
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI embedding adapter instance
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiEmbed("sk-...");
 * ```
 */
export function createOpenaiEmbed(
  apiKey: string,
  config?: Omit<OpenAIEmbedConfig, 'apiKey'>,
): OpenAIEmbedAdapter {
  return new OpenAIEmbedAdapter({ apiKey, ...config })
}

/**
 * Creates an OpenAI embedding adapter with automatic API key detection from environment variables.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI embedding adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiEmbed();
 *
 * await generate({
 *   adapter,
 *   model: "text-embedding-3-small",
 *   input: "Hello, world!"
 * });
 * ```
 */
export function openaiEmbed(
  config?: Omit<OpenAIEmbedConfig, 'apiKey'>,
): OpenAIEmbedAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiEmbed(apiKey, config)
}
