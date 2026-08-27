/** Options for `amazon.titan-embed-text-v2:0`. */
export interface BedrockTitanTextEmbeddingProviderOptions {
  normalize?: boolean
}

export type BedrockTitanImageEmbeddingProviderOptions = Record<string, never>

export type BedrockCohereEmbeddingInputType =
  | 'search_document'
  | 'search_query'
  | 'classification'
  | 'clustering'

/** Options for `cohere.embed-english-v3` / `cohere.embed-multilingual-v3`. */
export interface BedrockCohereEmbeddingProviderOptions {
  inputType: BedrockCohereEmbeddingInputType
  truncate?: 'NONE' | 'START' | 'END'
}

export type BedrockEmbeddingProviderOptions =
  | BedrockTitanTextEmbeddingProviderOptions
  | BedrockTitanImageEmbeddingProviderOptions
  | BedrockCohereEmbeddingProviderOptions
