// ============================================================================
// Cohere Adapters (tree-shakeable)
// ============================================================================

// Rerank adapter - document reranking via Cohere's /v2/rerank endpoint
export {
  CohereRerankAdapter,
  createCohereRerank,
  cohereRerank,
} from './adapters/rerank'

// ============================================================================
// Type Exports
// ============================================================================

export {
  COHERE_RERANK_MODELS,
  type CohereRerankModel,
  type CohereRerankProviderOptions,
  type CohereRerankModelProviderOptionsByName,
  type InferCohereRerankProviderOptions,
} from './model-meta'

export type { CohereClientConfig } from './utils/client'
