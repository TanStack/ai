import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getZAIApiKeyFromEnv } from '../utils/client'
import { ZAITextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { ZAI_CHAT_MODELS } from '../model-meta'
import type { ZAITextConfig } from './text'

export interface ZAISummarizeConfig extends ZAITextConfig {}

export type ZAISummarizeModel = (typeof ZAI_CHAT_MODELS)[number]

export type ZAISummarizeProviderOptions = InferTextProviderOptions<
  ZAITextAdapter<ZAISummarizeModel>
>

export type ZAISummarizeAdapter<TModel extends ZAISummarizeModel> =
  ChatStreamSummarizeAdapter<
    TModel,
    InferTextProviderOptions<ZAITextAdapter<TModel>>
  >

export function createZAISummarize<TModel extends ZAISummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<ZAISummarizeConfig, 'apiKey'>,
): ZAISummarizeAdapter<TModel> {
  return new ChatStreamSummarizeAdapter(
    new ZAITextAdapter({ apiKey, ...config }, model),
    model,
    'zai',
  )
}

export function zaiSummarize<TModel extends ZAISummarizeModel>(
  model: TModel,
  config?: Omit<ZAISummarizeConfig, 'apiKey'>,
): ZAISummarizeAdapter<TModel> {
  return createZAISummarize(model, getZAIApiKeyFromEnv(), config)
}
