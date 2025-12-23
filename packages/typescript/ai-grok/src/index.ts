// ============================================================================
// Thin Wrappers Around OpenAI Adapters (configured for Grok)
// ============================================================================

// Text (Chat) adapter - thin wrapper around OpenAI's adapter with Grok base URL
export {
  createGrokText,
  grokText,
  type GrokTextConfig,
  type GrokTextProviderOptions,
} from './adapters/text'

// Summarize adapter - thin wrapper around OpenAI's adapter with Grok base URL
export {
  createGrokSummarize,
  grokSummarize,
  type GrokSummarizeConfig,
  type GrokSummarizeProviderOptions,
  type GrokSummarizeModel,
} from './adapters/summarize'

// Image adapter - thin wrapper around OpenAI's adapter with Grok base URL
export {
  createGrokImage,
  grokImage,
  type GrokImageConfig,
  type GrokImageModel,
  type GrokImageProviderOptions,
} from './adapters/image'

// ============================================================================
// Grok-specific Model Metadata
// ============================================================================

export { GROK_CHAT_MODELS, GROK_IMAGE_MODELS } from './model-meta'
export type {
  GrokChatModelProviderOptionsByName,
  GrokModelInputModalitiesByName,
  GrokProviderOptions,
} from './model-meta'

// ============================================================================
// Re-exported Types from OpenAI (for convenience)
// ============================================================================

export type {
  OpenAITextMetadata as GrokTextMetadata,
  OpenAIImageMetadata as GrokImageMetadata,
  OpenAIAudioMetadata as GrokAudioMetadata,
  OpenAIVideoMetadata as GrokVideoMetadata,
  OpenAIDocumentMetadata as GrokDocumentMetadata,
  OpenAIMessageMetadataByModality as GrokMessageMetadataByModality,
} from '@tanstack/ai-openai'
