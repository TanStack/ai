// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  OllamaTextAdapter,
  createOllamaChat,
  ollamaText,
  type OllamaTextAdapterOptions,
  type OllamaTextModel,
  type OllamaTextProviderOptions,
} from './adapters/text'
export { OLLAMA_TEXT_MODELS as OllamaTextModels } from './model-meta'

// Summarize adapter
export {
  OllamaSummarizeAdapter,
  createOllamaSummarize,
  ollamaSummarize,
  type OllamaSummarizeAdapterOptions,
  type OllamaSummarizeModel,
  type OllamaSummarizeProviderOptions,
} from './adapters/summarize'
export { OLLAMA_TEXT_MODELS as OllamaSummarizeModels } from './model-meta'

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

export type {
  OllamaChatModelOptionsByName,
  OllamaModelInputModalitiesByName,
} from './model-meta'
