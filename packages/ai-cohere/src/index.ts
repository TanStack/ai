// Embedding adapter - for embedding vectors
export {
  CohereEmbeddingAdapter,
  createCohereEmbedding,
  cohereEmbedding,
  type CohereEmbeddingConfig,
} from './adapters/embedding'
export type { CohereEmbeddingProviderOptions } from './embedding/embedding-provider-options'

// Rerank adapter - document reranking via Cohere's /v2/rerank endpoint
export {
  CohereRerankAdapter,
  createCohereRerank,
  cohereRerank,
} from './adapters/rerank'

// Client config + env helpers
export { getCohereApiKeyFromEnv, type CohereClientConfig } from './utils/client'

export type {
  CohereEmbeddingModel,
  CohereEmbeddingModelProviderOptionsByName,
  CohereEmbeddingModelInputModalitiesByName,
} from './model-meta'
export { COHERE_EMBEDDING_MODELS } from './model-meta'

export {
  COHERE_RERANK_MODELS,
  type CohereRerankModel,
  type CohereRerankProviderOptions,
  type CohereRerankModelProviderOptionsByName,
  type InferCohereRerankProviderOptions,
} from './model-meta'
