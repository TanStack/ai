/**
 * Provider options for the Bedrock embedding models.
 *
 * `dimensions` is deliberately absent from every options shape: it's a
 * first-class top-level option on `embed()`. The adapter maps it onto each
 * model's native field (Titan Text `dimensions`, Titan Multimodal
 * `embeddingConfig.outputEmbeddingLength`) and rejects it for the Cohere
 * models, whose output size is fixed.
 */

/** Options for `amazon.titan-embed-text-v2:0`. */
export interface BedrockTitanTextEmbeddingProviderOptions {
  /**
   * Normalize the output embedding to unit length. Titan's service-side
   * default is `true`; leave unset to use it.
   */
  normalize?: boolean
}

/**
 * Options for `amazon.titan-embed-image-v1` (Titan Multimodal Embeddings).
 * The model has no per-request options beyond the top-level `dimensions`
 * (mapped onto `embeddingConfig.outputEmbeddingLength`).
 */
export type BedrockTitanImageEmbeddingProviderOptions = Record<string, never>

/**
 * Cohere embed input types. Cohere REQUIRES the caller to say what the
 * embeddings are for; there is no service-side default.
 */
export type BedrockCohereEmbeddingInputType =
  | 'search_document'
  | 'search_query'
  | 'classification'
  | 'clustering'

/** Options for `cohere.embed-english-v3` / `cohere.embed-multilingual-v3`. */
export interface BedrockCohereEmbeddingProviderOptions {
  /**
   * What the embeddings will be used for (required by the Cohere API; sent
   * as `input_type`). Use `search_document` when indexing, `search_query`
   * when querying, `classification` / `clustering` for those downstream
   * tasks. Because this field is required, `modelOptions` is required at the
   * `embed()` call site for the Cohere models.
   */
  inputType: BedrockCohereEmbeddingInputType
  /**
   * How to handle inputs longer than the model's maximum token length.
   * `NONE` (the API default) returns an error, `START` / `END` truncate
   * from that side.
   */
  truncate?: 'NONE' | 'START' | 'END'
}

/**
 * Broad union used as the adapter's base `TProviderOptions` fallback when
 * the model isn't statically known. Per-model narrowing happens via
 * `BedrockEmbeddingModelProviderOptionsByName`.
 */
export type BedrockEmbeddingProviderOptions =
  | BedrockTitanTextEmbeddingProviderOptions
  | BedrockTitanImageEmbeddingProviderOptions
  | BedrockCohereEmbeddingProviderOptions
