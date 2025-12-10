// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  OpenAITextAdapter,
  createOpenaiText,
  openaiText,
  type OpenAITextConfig,
  type OpenAITextProviderOptions,
} from './adapters/text'

// Embedding adapter - for text embeddings
export {
  OpenAIEmbedAdapter,
  createOpenaiEmbed,
  openaiEmbed,
  type OpenAIEmbedConfig,
  type OpenAIEmbedProviderOptions,
} from './adapters/embed'

// Summarize adapter - for text summarization
export {
  OpenAISummarizeAdapter,
  createOpenaiSummarize,
  openaiSummarize,
  type OpenAISummarizeConfig,
  type OpenAISummarizeProviderOptions,
} from './adapters/summarize'

// ============================================================================
// Legacy Exports (Deprecated - will be removed in future versions)
// ============================================================================

/**
 * @deprecated Use `openaiText()`, `openaiEmbed()`, or `openaiSummarize()` instead.
 * This monolithic adapter will be removed in a future version.
 */
export {
  OpenAI,
  createOpenAI,
  openai,
  type OpenAIConfig,
} from './openai-adapter'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  OpenAIChatModelProviderOptionsByName,
  OpenAIModelInputModalitiesByName,
} from './model-meta'
export type {
  OpenAITextMetadata,
  OpenAIImageMetadata,
  OpenAIAudioMetadata,
  OpenAIVideoMetadata,
  OpenAIDocumentMetadata,
  OpenAIMessageMetadataByModality,
} from './message-types'
