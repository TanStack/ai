/**
 * Provider options for Cohere embedding models.
 *
 * `dimensions` is deliberately absent: it's a first-class top-level option on
 * `embed()` and is mapped to Cohere's `output_dimension` request field by the
 * adapter.
 */

/**
 * Provider options for `embed-v4.0`.
 *
 * `inputType` is required by Cohere's v2 embed API, which makes
 * `modelOptions` required at the `embed()` call site.
 */
export interface CohereEmbeddingProviderOptions {
  /**
   * The intended downstream use of the embeddings. Cohere requires this to
   * pick the right embedding space:
   * - `search_document` — corpus items stored for later retrieval
   * - `search_query` — queries run against stored documents
   * - `classification` — inputs embedded for classification tasks
   * - `clustering` — inputs embedded for clustering tasks
   */
  inputType:
    | 'search_document'
    | 'search_query'
    | 'classification'
    | 'clustering'

  /**
   * Requested embedding value encodings. The adapter always pins this to
   * `['float']` so vectors are plain `number[]`; other encodings are not
   * supported through TanStack AI.
   */
  embeddingTypes?: ['float']

  /**
   * How to handle inputs longer than the model's maximum token length.
   * `NONE` returns an error for over-long inputs; `START`/`END` truncate
   * from the respective side. Defaults to Cohere's server-side default
   * (`END`) when omitted.
   */
  truncate?: 'NONE' | 'START' | 'END'
}
