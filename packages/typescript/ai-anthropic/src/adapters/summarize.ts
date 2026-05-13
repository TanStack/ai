import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getAnthropicApiKeyFromEnv } from '../utils'
import { AnthropicTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { ANTHROPIC_MODELS } from '../model-meta'
import type { AnthropicClientConfig } from '../utils'

export interface AnthropicSummarizeConfig extends AnthropicClientConfig {}

export type AnthropicSummarizeModel = (typeof ANTHROPIC_MODELS)[number]

/**
 * Creates an Anthropic summarize adapter with explicit API key.
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
 * Creates an Anthropic summarize adapter with API key from `ANTHROPIC_API_KEY`.
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
