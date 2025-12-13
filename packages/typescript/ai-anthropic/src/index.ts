// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  AnthropicTextAdapter,
  anthropicText,
  createAnthropicText,
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

// Note: Anthropic does not support embeddings natively

// ============================================================================
// Legacy Exports (Deprecated - will be removed in future versions)
// ============================================================================

/**
 * @deprecated Use `anthropicText()` or `anthropicSummarize()` instead.
 * This monolithic adapter will be removed in a future version.
 */
export {
  Anthropic,
  createAnthropic,
  anthropic,
  type AnthropicConfig,
} from './anthropic-adapter'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from './model-meta'
export type {
  AnthropicTextMetadata,
  AnthropicImageMetadata,
  AnthropicDocumentMetadata,
  AnthropicAudioMetadata,
  AnthropicVideoMetadata,
  AnthropicImageMediaType,
  AnthropicDocumentMediaType,
  AnthropicMessageMetadataByModality,
} from './message-types'

// Export tool conversion utilities
export { convertToolsToProviderFormat } from './tools/tool-converter'

// Export tool types
export type { AnthropicTool, CustomTool } from './tools'
