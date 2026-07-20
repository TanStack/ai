import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGrokApiKeyFromEnv } from '../utils/client'
import { GrokTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GROK_CHAT_MODELS } from '../model-meta'
import type { GrokClientConfig } from '../utils/client'

/**
 * Configuration for Grok summarize adapter
 */
export interface GrokSummarizeConfig extends GrokClientConfig {}

/** Model type for Grok summarization */
export type GrokSummarizeModel = (typeof GROK_CHAT_MODELS)[number]

/**
 * Creates a Grok summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'grok-build-0.1')
 * @param apiKey - Your xAI API key
 * @param config - Optional additional configuration
 * @returns Configured Grok summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createGrokSummarize('grok-build-0.1', "xai-...");
 * ```
 */
export function createGrokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GrokTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new GrokTextAdapter({ apiKey, ...config }, model),
    model,
    'grok',
  )
}

/**
 * Creates a Grok summarize adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `XAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'grok-build-0.1')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Grok summarize adapter instance with resolved types
 * @throws Error if XAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses XAI_API_KEY from environment
 * const adapter = grokSummarize('grok-build-0.1');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function grokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GrokTextAdapter<TModel>>
> {
  return createGrokSummarize(model, getGrokApiKeyFromEnv(), config)
}
