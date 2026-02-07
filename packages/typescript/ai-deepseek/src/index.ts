// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  DeepSeekTextAdapter,
  createDeepSeekText,
  deepseekText,
  type DeepSeekTextConfig,
  type DeepSeekTextProviderOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  DeepSeekSummarizeAdapter,
  createDeepSeekSummarize,
  deepseekSummarize,
  type DeepSeekSummarizeConfig,
  type DeepSeekSummarizeProviderOptions,
  type DeepSeekSummarizeModel,
} from './adapters/summarize'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  DeepSeekChatModelProviderOptionsByName,
  DeepSeekModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
} from './model-meta'
export { DEEPSEEK_CHAT_MODELS } from './model-meta'
export type {
  DeepSeekTextMetadata,
  DeepSeekImageMetadata,
  DeepSeekAudioMetadata,
  DeepSeekVideoMetadata,
  DeepSeekDocumentMetadata,
  DeepSeekMessageMetadataByModality,
} from './message-types'
