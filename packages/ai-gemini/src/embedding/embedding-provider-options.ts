export interface GeminiEmbeddingProviderOptions {
  taskType?:
    | 'SEMANTIC_SIMILARITY'
    | 'CLASSIFICATION'
    | 'CLUSTERING'
    | 'RETRIEVAL_DOCUMENT'
    | 'RETRIEVAL_QUERY'
    | 'QUESTION_ANSWERING'
    | 'FACT_VERIFICATION'
    | 'CODE_RETRIEVAL_QUERY'

  title?: string
}
