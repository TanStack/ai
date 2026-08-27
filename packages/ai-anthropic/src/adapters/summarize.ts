import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getAnthropicApiKeyFromEnv } from '../utils/client'
import { AnthropicTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { ANTHROPIC_MODELS } from '../model-meta'
import type { AnthropicClientConfig } from '../utils/client'

export interface AnthropicSummarizeConfig extends AnthropicClientConfig {}

/** Model type for Anthropic summarization */
export type AnthropicSummarizeModel = (typeof ANTHROPIC_MODELS)[number]

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

export function anthropicSummarize<TModel extends AnthropicSummarizeModel>(
  model: TModel,
  config?: Omit<AnthropicSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<AnthropicTextAdapter<TModel>>
> {
  return createAnthropicSummarize(model, getAnthropicApiKeyFromEnv(), config)
}
