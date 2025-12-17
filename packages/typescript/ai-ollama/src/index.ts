// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  OllamaTextAdapter,
  OllamaTextModels,
  createOllamaChat,
  ollamaText,
  // Deprecated exports
  createOllamaText,
  ollamaChat,
  type OllamaTextAdapterOptions,
  type OllamaTextModel,
  type OllamaTextProviderOptions,
} from './adapters/text'

// Embedding adapter
export {
  OllamaEmbedAdapter,
  OllamaEmbeddingModels,
  createOllamaEmbedding,
  ollamaEmbedding,
  // Deprecated exports
  createOllamaEmbed,
  ollamaEmbed,
  type OllamaEmbedAdapterOptions,
  type OllamaEmbeddingModel,
  type OllamaEmbedProviderOptions,
} from './adapters/embed'

// Summarize adapter
export {
  OllamaSummarizeAdapter,
  OllamaSummarizeModels,
  createOllamaSummarize,
  ollamaSummarize,
  type OllamaSummarizeAdapterOptions,
  type OllamaSummarizeModel,
  type OllamaSummarizeProviderOptions,
} from './adapters/summarize'

// ===========================
// Type Exports
// ===========================

export type {
  OllamaImageMetadata,
  OllamaAudioMetadata,
  OllamaVideoMetadata,
  OllamaDocumentMetadata,
  OllamaMessageMetadataByModality,
} from './message-types'
