/**
 * Provider options for Gemini embedding models.
 *
 * `dimensions` is deliberately absent: it's a first-class top-level option on
 * `embed()` and is mapped to the SDK's `outputDimensionality` by the adapter.
 */
export interface GeminiEmbeddingProviderOptions {
  /**
   * Type of task for which the embedding will be used. Helps the model
   * produce embeddings optimized for the intended use case.
   *
   * @see https://ai.google.dev/gemini-api/docs/embeddings#task-types
   */
  taskType?:
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING'
    | 'RETRIEVAL_DOCUMENT'
    | 'RETRIEVAL_QUERY'
    | 'QUESTION_ANSWERING'
    | 'FACT_VERIFICATION'
    | 'CODE_RETRIEVAL_QUERY'

  /**
   * Title for the text. Only applicable when `taskType` is
   * `RETRIEVAL_DOCUMENT`.
   */
  title?: string
}
