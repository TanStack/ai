// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  OllamaTextAdapter,
  OllamaTextModels,
  createOllamaChat,
  ollamaChat,
  // Deprecated exports
  createOllamaText,
  ollamaText,
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
// Legacy monolithic adapter (deprecated)
// ===========================

/**
 * @deprecated Use the new tree-shakeable adapters instead:
 * - `ollamaText()` / `createOllamaText()` for chat/text generation
 * - `ollamaEmbed()` / `createOllamaEmbed()` for embeddings
 * - `ollamaSummarize()` / `createOllamaSummarize()` for summarization
 */
export {
  Ollama,
  createOllama,
  ollama,
  type OllamaConfig,
} from './ollama-adapter'
export type {
  OllamaImageMetadata,
  OllamaAudioMetadata,
  OllamaVideoMetadata,
  OllamaDocumentMetadata,
  OllamaMessageMetadataByModality,
} from './message-types'
