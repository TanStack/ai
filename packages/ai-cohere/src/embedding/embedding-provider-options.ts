export interface CohereEmbeddingProviderOptions {
  inputType:
    | 'search_document'
    | 'search_query'
    | 'classification'
    | 'clustering'

  embeddingTypes?: ['float']

  truncate?: 'NONE' | 'START' | 'END'
}
