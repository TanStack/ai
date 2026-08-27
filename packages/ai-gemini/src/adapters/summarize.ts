import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getGeminiApiKeyFromEnv } from '../utils'
import { GeminiTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { GEMINI_MODELS } from '../model-meta'
import type { GeminiClientConfig } from '../utils/client'

export interface GeminiSummarizeConfig extends GeminiClientConfig {}

export type GeminiSummarizeModel = (typeof GEMINI_MODELS)[number]

export function createGeminiSummarize<TModel extends GeminiSummarizeModel>(
  apiKey: string,
  model: TModel,
  config?: Omit<GeminiSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GeminiTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new GeminiTextAdapter({ ...config, apiKey }, model),
    model,
    'gemini',
  )
}

export function geminiSummarize<TModel extends GeminiSummarizeModel>(
  model: TModel,
  config?: Omit<GeminiSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<GeminiTextAdapter<TModel>>
> {
  return createGeminiSummarize(getGeminiApiKeyFromEnv(), model, config)
}
