import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGrokApiKeyFromEnv } from '../utils/client'
import { GrokTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GROK_CHAT_MODELS } from '../model-meta'
import type { GrokClientConfig } from '../utils/client'

export interface GrokSummarizeConfig extends GrokClientConfig {}

/** Model type for Grok summarization */
export type GrokSummarizeModel = (typeof GROK_CHAT_MODELS)[number]

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

export function grokSummarize<TModel extends GrokSummarizeModel>(
  model: TModel,
  config?: Omit<GrokSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GrokTextAdapter<TModel>>
> {
  return createGrokSummarize(model, getGrokApiKeyFromEnv(), config)
}
