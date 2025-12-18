// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  OllamaTextAdapter,
  OllamaTextModels,
  createOllamaChat,
  ollamaText,
  type OllamaTextAdapterOptions,
  type OllamaTextModel,
  type OllamaTextProviderOptions,
} from './adapters/text'

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
