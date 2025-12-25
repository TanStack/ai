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
  type GrokSummarizeModel,
} from './adapters/summarize'

// Image adapter - for image generation
export {
  GrokImageAdapter,
  createGrokImage,
  grokImage,
  type GrokImageConfig,
  type GrokImageModel,
} from './adapters/image'
export type {
  GrokImageProviderOptions,
  GrokImageModelProviderOptionsByName,
} from './image/image-provider-options'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  GrokChatModelProviderOptionsByName,
  GrokModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
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
