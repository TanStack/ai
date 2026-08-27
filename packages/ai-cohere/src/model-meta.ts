import type { CohereEmbeddingProviderOptions } from './embedding/embedding-provider-options'

export const COHERE_EMBEDDING_MODELS = ['embed-v4.0'] as const

export type CohereEmbeddingModel = (typeof COHERE_EMBEDDING_MODELS)[number]

export type CohereEmbeddingModelProviderOptionsByName = {
  'embed-v4.0': CohereEmbeddingProviderOptions
}

export type CohereEmbeddingModelInputModalitiesByName = {
  'embed-v4.0': readonly ['text', 'image']
}

/** Available Cohere rerank models. */
export const COHERE_RERANK_MODELS = [
  'rerank-v3.5',
  'rerank-english-v3.0',
  'rerank-multilingual-v3.0',
] as const

/** Union of supported Cohere rerank model names. */
export type CohereRerankModel = (typeof COHERE_RERANK_MODELS)[number]

export interface CohereRerankProviderOptions {
  maxTokensPerDoc?: number
}

export interface CohereRerankModelProviderOptionsByName {
  'rerank-v3.5': CohereRerankProviderOptions
  'rerank-english-v3.0': CohereRerankProviderOptions
  'rerank-multilingual-v3.0': CohereRerankProviderOptions
}

export type InferCohereRerankProviderOptions<TModel extends string> =
  TModel extends keyof CohereRerankModelProviderOptionsByName
    ? CohereRerankModelProviderOptionsByName[TModel]
    : CohereRerankProviderOptions
