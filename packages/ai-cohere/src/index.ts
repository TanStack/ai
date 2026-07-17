/**
 * @module @tanstack/ai-cohere
 *
 * Cohere provider adapter for TanStack AI.
 * Provides a tree-shakeable adapter for Cohere's v2/embed API
 * (multimodal embeddings) using plain fetch — no SDK dependency.
 */

// Embedding adapter - for embedding vectors
export {
  CohereEmbeddingAdapter,
  createCohereEmbedding,
  cohereEmbedding,
  type CohereEmbeddingConfig,
} from './adapters/embedding'
export type { CohereEmbeddingProviderOptions } from './embedding/embedding-provider-options'

// Client config + env helpers
export { getCohereApiKeyFromEnv, type CohereClientConfig } from './utils/client'

// Types
export type {
  CohereEmbeddingModel,
  CohereEmbeddingModelProviderOptionsByName,
  CohereEmbeddingModelInputModalitiesByName,
} from './model-meta'
export { COHERE_EMBEDDING_MODELS } from './model-meta'
