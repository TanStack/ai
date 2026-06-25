/**
 * Cohere rerank model metadata.
 *
 * Provider options are resolved per model at the `cohereRerank('model')` call
 * site via {@link CohereRerankModelProviderOptionsByName}. Cohere's rerank
 * models currently share the same options, but the per-model map keeps the
 * surface symmetric with the other adapters and lets divergent options be
 * expressed later without changing the adapter contract.
 */

/** Available Cohere rerank models. */
export const COHERE_RERANK_MODELS = [
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
