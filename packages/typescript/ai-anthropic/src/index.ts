// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  AnthropicTextAdapter,
  anthropicText,
  createAnthropicChat,
  type AnthropicTextConfig,
  type AnthropicTextProviderOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  AnthropicSummarizeAdapter,
  anthropicSummarize,
  createAnthropicSummarize,
  type AnthropicSummarizeConfig,
  type AnthropicSummarizeProviderOptions,
} from './adapters/summarize'
export { ANTHROPIC_MODELS } from './model-meta'
// ============================================================================
// Type Exports
// ============================================================================

export type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
  AnthropicChatModel,
} from './model-meta'
export type {
  AnthropicTextMetadata,
  AnthropicImageMetadata,
  AnthropicDocumentMetadata,
  AnthropicAudioMetadata,
  AnthropicVideoMetadata,
  AnthropicMessageMetadataByModality,
} from './message-types'

// Export tool conversion utilities
export { convertToolsToProviderFormat } from './tools/tool-converter'

// Export tool types
export type { AnthropicTool, CustomTool } from './tools'
