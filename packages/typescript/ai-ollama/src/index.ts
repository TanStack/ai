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

// Summarize - thin factory functions over @tanstack/ai's ChatStreamSummarizeAdapter
export {
  createOllamaSummarize,
  ollamaSummarize,
  type OllamaSummarizeAdapterOptions,
  type OllamaSummarizeModel,
} from './adapters/summarize'
export { OLLAMA_TEXT_MODELS as OllamaSummarizeModels } from './model-meta'

// Tool converters
export {
  convertFunctionToolToAdapterFormat,
  convertToolsToProviderFormat,
} from './tools'

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
