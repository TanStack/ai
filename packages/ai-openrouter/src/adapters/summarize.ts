import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOpenRouterApiKeyFromEnv } from '../utils'
import { OpenRouterTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { OpenRouterConfig } from './text'
import type { OPENROUTER_CHAT_MODELS } from '../model-meta'
import type { SDKOptions } from '@openrouter/sdk'

export type OpenRouterTextModels = (typeof OPENROUTER_CHAT_MODELS)[number]

export interface OpenRouterSummarizeConfig extends OpenRouterConfig {
  /** Default temperature for summarization (0-2). Defaults to 0.3. */
  temperature?: number
  /** Default maximum tokens in the response */
  maxTokens?: number
}

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

export function openRouterSummarize<TModel extends OpenRouterTextModels>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OpenRouterTextAdapter<TModel>>
> {
  return createOpenRouterSummarize(model, getOpenRouterApiKeyFromEnv(), config)
}
