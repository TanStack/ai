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
