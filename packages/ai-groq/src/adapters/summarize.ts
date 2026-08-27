import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGroqApiKeyFromEnv } from '../utils/client'
import { GroqTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GROQ_CHAT_MODELS } from '../model-meta'
import type { GroqClientConfig } from '../utils/client'

export interface GroqSummarizeConfig extends GroqClientConfig {}

/** Model type for Groq summarization */
export type GroqSummarizeModel = (typeof GROQ_CHAT_MODELS)[number]

export function createGroqSummarize<TModel extends GroqSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GroqSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GroqTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new GroqTextAdapter({ apiKey, ...config }, model),
    model,
    'groq',
  )
}

export function groqSummarize<TModel extends GroqSummarizeModel>(
  model: TModel,
  config?: Omit<GroqSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GroqTextAdapter<TModel>>
> {
  return createGroqSummarize(model, getGroqApiKeyFromEnv(), config)
}
