import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getLovableApiKeyFromEnv } from '../utils/client'
import { LovableTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { LovableModelId } from '../model-meta'
import type { LovableClientConfig } from '../utils/client'

export interface LovableSummarizeConfig extends LovableClientConfig {}

export type LovableSummarizeModel = LovableModelId

export function createLovableSummarize<TModel extends LovableSummarizeModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<LovableSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<LovableTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new LovableTextAdapter({ apiKey, ...config }, model),
    model,
    'lovable',
  )
}

export function lovableSummarize<TModel extends LovableSummarizeModel>(
  model: TModel,
  config?: Omit<LovableSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<LovableTextAdapter<TModel>>
> {
  return createLovableSummarize(model, getLovableApiKeyFromEnv(), config)
}
