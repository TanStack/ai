import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import { OpenRouterTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { OpenRouterConfig } from './text'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'
import type { SDKOptions } from '@openrouter/sdk'

export type OpenRouterTextModels = (typeof OPENROUTER_CHAT_MODELS)[number]

/**
 * Configuration for OpenRouter summarize adapter
 */
export interface OpenRouterSummarizeConfig extends OpenRouterConfig {
  /** Default temperature for summarization (0-2). Defaults to 0.3. */
  temperature?: number
  /** Default maximum tokens in the response */
  maxTokens?: number
}

/**
 * Creates an OpenRouter summarize adapter with explicit API key.
 *
 * @example
 * ```typescript
 * const adapter = createOpenRouterSummarize('openai/gpt-4o-mini', 'sk-or-...');
 * ```
 */
export function createOpenRouterSummarize<TModel extends OpenRouterTextModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<SDKOptions, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OpenRouterTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new OpenRouterTextAdapter({ apiKey, ...config }, model),
    model,
    'openrouter',
  )
}

/**
 * Creates an OpenRouter summarize adapter with API key from
 * `OPENROUTER_API_KEY` in `process.env` (Node) or `window.env` (browser).
 *
 * @example
 * ```typescript
 * const adapter = openRouterSummarize('openai/gpt-4o-mini');
 * await summarize({ adapter, text: 'Long article text...' });
 * ```
 */
export function openRouterSummarize<TModel extends OpenRouterTextModels>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OpenRouterTextAdapter<TModel>>
> {
  return createOpenRouterSummarize(model, getOpenRouterApiKeyFromEnv(), config)
}
