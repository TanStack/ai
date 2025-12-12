import { BaseAdapter } from '@tanstack/ai'
import { GROK_CHAT_MODELS, GROK_EMBEDDING_MODELS } from './model-meta'
import { createGrokClient, getGrokApiKeyFromEnv } from './utils'
import type OpenAI_SDK from 'openai'
import type {
  DefaultMessageMetadataByModality,
  EmbeddingOptions,
  EmbeddingResult,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  TextOptions,
} from '@tanstack/ai'
import type {
  GrokChatModelProviderOptionsByName,
  GrokModelInputModalitiesByName,
  GrokProviderOptions,
} from './model-meta'
import type { GrokClientConfig } from './utils'

export interface GrokConfig extends GrokClientConfig {}

/**
 * Legacy Grok Adapter
 *
 * @deprecated Use the new tree-shakeable adapters instead:
 * - `grokText()` / `createGrokText()` for chat/text generation
 * - `grokSummarize()` / `createGrokSummarize()` for summarization
 * - `grokImage()` / `createGrokImage()` for image generation
 *
 * This monolithic adapter will be removed in a future version.
 */
export class Grok extends BaseAdapter<
  typeof GROK_CHAT_MODELS,
  typeof GROK_EMBEDDING_MODELS,
  GrokProviderOptions,
  Record<string, any>,
  GrokChatModelProviderOptionsByName,
  GrokModelInputModalitiesByName,
  DefaultMessageMetadataByModality
> {
  name = 'grok' as const
  models = GROK_CHAT_MODELS
  embeddingModels = GROK_EMBEDDING_MODELS

  // Type-only map used by core AI to infer per-model provider options.
  // This is never set at runtime; it exists purely for TypeScript.
  declare _modelProviderOptionsByName: GrokChatModelProviderOptionsByName
  // Type-only map for model input modalities; used for multimodal content type constraints
  declare _modelInputModalitiesByName: GrokModelInputModalitiesByName
  // Type-only map for message metadata types; used for type-safe metadata autocomplete
  declare _messageMetadataByModality: DefaultMessageMetadataByModality

  private client: OpenAI_SDK

  constructor(config: GrokConfig) {
    super({})
    this.client = createGrokClient(config)
  }

  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    // Delegate to the text adapter's implementation
    // For now, we'll use a simplified version
    const { GrokTextAdapter } = await import('./adapters/text')
    const textAdapter = new GrokTextAdapter({
      apiKey: (this.client as any).apiKey,
      baseURL: (this.client as any).baseURL,
    })
    yield* textAdapter.chatStream(options)
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    // Delegate to the summarize adapter
    const { GrokSummarizeAdapter } = await import('./adapters/summarize')
    const summarizeAdapter = new GrokSummarizeAdapter({
      apiKey: (this.client as any).apiKey,
      baseURL: (this.client as any).baseURL,
    })
    return summarizeAdapter.summarize(options)
  }

  createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    // Grok does not support embeddings
    return Promise.reject(
      new Error(
        'Grok does not support embeddings. Please use a different provider for embeddings.',
      ),
    )
  }
}

/**
 * Creates a Grok adapter with simplified configuration
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns A fully configured Grok adapter instance
 *
 * @deprecated Use the new tree-shakeable adapters instead:
 * - `grokText()` / `createGrokText()` for chat/text generation
 * - `grokSummarize()` / `createGrokSummarize()` for summarization
 * - `grokImage()` / `createGrokImage()` for image generation
 *
 * @example
 * ```typescript
 * const grok = createGrok("xai-...");
 *
 * const ai = new AI({
 *   adapters: {
 *     grok,
 *   }
 * });
 * ```
 */
export function createGrok(
  apiKey: string,
  config?: Omit<GrokConfig, 'apiKey'>,
): Grok {
  return new Grok({ apiKey, ...config })
}

/**
 * Create a Grok adapter with automatic API key detection from environment variables.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * Falls back to error if not found.
 *
 * @deprecated Use the new tree-shakeable adapters instead:
 * - `grokText()` / `createGrokText()` for chat/text generation
 * - `grokSummarize()` / `createGrokSummarize()` for summarization
 * - `grokImage()` / `createGrokImage()` for image generation
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok adapter instance
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment or throws error
 * const aiInstance = ai(grok());
 * ```
 */
export function grok(config?: Omit<GrokConfig, 'apiKey'>): Grok {
  const apiKey = getGrokApiKeyFromEnv()
  return createGrok(apiKey, config)
}
