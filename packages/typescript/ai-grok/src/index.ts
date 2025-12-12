// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  GrokTextAdapter,
  createGrokText,
  grokText,
  type GrokTextConfig,
  type GrokTextProviderOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  GrokSummarizeAdapter,
  createGrokSummarize,
  grokSummarize,
  type GrokSummarizeConfig,
  type GrokSummarizeProviderOptions,
} from './adapters/summarize'

// Image adapter - for image generation
export {
  GrokImageAdapter,
  createGrokImage,
  grokImage,
  type GrokImageConfig,
} from './adapters/image'
export type {
  GrokImageProviderOptions,
  GrokImageModelProviderOptionsByName,
} from './image/image-provider-options'

// ============================================================================
// Legacy Exports (Deprecated - will be removed in future versions)
// ============================================================================

/**
 * @deprecated Use `grokText()`, `grokSummarize()`, or `grokImage()` instead.
 * This monolithic adapter will be removed in a future version.
 */
export { Grok, createGrok, grok, type GrokConfig } from './grok-adapter'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  GrokChatModelProviderOptionsByName,
  GrokModelInputModalitiesByName,
} from './model-meta'
export { GROK_CHAT_MODELS, GROK_IMAGE_MODELS } from './model-meta'
export type {
  GrokTextMetadata,
  GrokImageMetadata,
  GrokAudioMetadata,
  GrokVideoMetadata,
  GrokDocumentMetadata,
  GrokMessageMetadataByModality,
} from './message-types'
