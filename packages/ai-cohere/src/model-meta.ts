import type { CohereEmbeddingProviderOptions } from './embedding/embedding-provider-options'

/**
 * Embedding models (based on endpoints: "v2/embed")
 */
export const COHERE_EMBEDDING_MODELS = ['embed-v4.0'] as const

/**
 * Union type of all supported Cohere embedding model names.
 */
export type CohereEmbeddingModel = (typeof COHERE_EMBEDDING_MODELS)[number]

/**
 * Type-only map from embedding model name to its provider options type.
 */
export type CohereEmbeddingModelProviderOptionsByName = {
  'embed-v4.0': CohereEmbeddingProviderOptions
}

/**
 * Per-model input modalities for embedding models. embed-v4.0 is
 * multimodal: it accepts text and image inputs (including fused
 * text+image items that produce a single vector).
 */
export type CohereEmbeddingModelInputModalitiesByName = {
  'embed-v4.0': readonly ['text', 'image']
}

/** Available Cohere rerank models. */
export const /** Available Cohere rerank models. */
COHERE_RERANK_MODELS = [
  'rerank-v3.5',
  'rerank-english-v3.0',
  'rerank-multilingual-v3.0',
] as const

/** Union of supported Cohere rerank model names. */
export type CohereRerankModel = (typeof COHERE_RERANK_MODELS)[number]

/**
 * Provider-specific options for a Cohere rerank request. Forwarded on the
 * `modelOptions` field of `rerank()`.
 */
export interface CohereRerankProviderOptions {
  /**
     * Long documents are chunked to fit the model's context. This caps the
     * number of tokens kept per document. Cohere defaults to 4096.
     */
  maxTokensPerDoc?: number
}

/**
 * Per-model provider-options map. Each model resolves to its own options type
 * at the factory call site (see {@link InferCohereRerankProviderOptions}).
 */
export interface CohereRerankModelProviderOptionsByName {
  'rerank-v3.5': CohereRerankProviderOptions
  'rerank-english-v3.0': CohereRerankProviderOptions
  'rerank-multilingual-v3.0': CohereRerankProviderOptions
}

/**
 * Resolve the provider options for a given rerank model. Falls back to the
 * base options for any model not in the map.
 */
export type InferCohereRerankProviderOptions<TModel extends string> =
  TModel extends keyof CohereRerankModelProviderOptionsByName
    ? CohereRerankModelProviderOptionsByName[TModel]
    : CohereRerankProviderOptions
