import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getAnthropicApiKeyFromEnv } from '../utils'
import { AnthropicTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { ANTHROPIC_MODELS } from '../model-meta'
import type { AnthropicClientConfig } from '../utils'

/**
 * Configuration for Anthropic summarize adapter
 */
export interface AnthropicSummarizeConfig extends AnthropicClientConfig {}

/** Model type for Anthropic summarization */
export type AnthropicSummarizeModel = (typeof ANTHROPIC_MODELS)[number]

/**
 * Creates an Anthropic summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'claude-sonnet-4-5', 'claude-3-5-haiku-latest')
 * @param apiKey - Your Anthropic API key
 * @param config - Optional additional configuration
 * @returns Configured Anthropic summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createAnthropicSummarize('claude-sonnet-4-5', 'sk-ant-...');
 * ```
 */
export function createAnthropicSummarize<
  TModel extends AnthropicSummarizeModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<AnthropicTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new AnthropicTextAdapter({ apiKey, ...config }, model),
    model,
    'anthropic',
  )
}

/**
 * Creates an Anthropic summarize adapter with automatic API key detection.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'claude-sonnet-4-5', 'claude-3-5-haiku-latest')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Anthropic summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = anthropicSummarize('claude-sonnet-4-5');
 * await summarize({ adapter, text: 'Long article text...' });
 * ```
 */
export function anthropicSummarize<TModel extends AnthropicSummarizeModel>(
  model: TModel,
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<AnthropicTextAdapter<TModel>>
> {
  return createAnthropicSummarize(model, getAnthropicApiKeyFromEnv(), config)
}
