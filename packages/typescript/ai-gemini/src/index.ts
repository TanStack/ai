// ===========================
// New tree-shakeable adapters
// ===========================

// Text/Chat adapter
export {
  GeminiTextAdapter,
  createGeminiText,
  geminiText,
  type GeminiTextConfig,
  type GeminiTextProviderOptions,
} from './adapters/text'

// Embedding adapter
export {
  GeminiEmbedAdapter,
  GeminiEmbeddingModels,
  createGeminiEmbed,
  geminiEmbed,
  type GeminiEmbedAdapterOptions,
  type GeminiEmbeddingModel,
  type GeminiEmbedProviderOptions,
} from './adapters/embed'

// Summarize adapter
export {
  GeminiSummarizeAdapter,
  GeminiSummarizeModels,
  createGeminiSummarize,
  geminiSummarize,
  type GeminiSummarizeAdapterOptions,
  type GeminiSummarizeModel,
  type GeminiSummarizeProviderOptions,
} from './adapters/summarize'

// Re-export models from model-meta for convenience
export { GEMINI_MODELS as GeminiTextModels } from './model-meta'
export type { GeminiModels as GeminiTextModel } from './model-meta'

// ===========================
// Legacy monolithic adapter (deprecated)
// ===========================

/**
 * @deprecated Use the new tree-shakeable adapters instead:
 * - `geminiText()` / `createGeminiText()` for chat/text generation
 * - `geminiEmbed()` / `createGeminiEmbed()` for embeddings
 * - `geminiSummarize()` / `createGeminiSummarize()` for summarization
 */
export { GeminiAdapter, createGemini, gemini } from './gemini-adapter'
export type { GeminiAdapterConfig } from './gemini-adapter'
export type {
  GeminiChatModelProviderOptionsByName,
  GeminiModelInputModalitiesByName,
} from './model-meta'
export type {
  GeminiStructuredOutputOptions,
  GeminiThinkingOptions,
} from './text/text-provider-options'
export type { GoogleGeminiTool } from './tools/index'
export type {
  GeminiTextMetadata,
  GeminiImageMetadata,
  GeminiAudioMetadata,
  GeminiVideoMetadata,
  GeminiDocumentMetadata,
  GeminiImageMimeType,
  GeminiAudioMimeType,
  GeminiVideoMimeType,
  GeminiDocumentMimeType,
  GeminiMessageMetadataByModality,
} from './message-types'
