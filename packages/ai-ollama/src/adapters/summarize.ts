import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOllamaHostFromEnv } from '../utils'
import { OllamaTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { OLLAMA_TEXT_MODELS as OllamaSummarizeModels } from '../model-meta'

export type OllamaSummarizeModel =
  | (typeof OllamaSummarizeModels)[number]
  | (string & {})

export interface OllamaSummarizeAdapterOptions {
  host?: string
}

export function createOllamaSummarize<TModel extends OllamaSummarizeModel>(
  model: TModel,
  host?: string,
  _options?: OllamaSummarizeAdapterOptions,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OllamaTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new OllamaTextAdapter(host, model),
    model,
    'ollama',
  )
}

export function ollamaSummarize<TModel extends OllamaSummarizeModel>(
  model: TModel,
  options?: OllamaSummarizeAdapterOptions,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OllamaTextAdapter<TModel>>
> {
  return createOllamaSummarize(model, getOllamaHostFromEnv(), options)
}
