// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  OpenRouterTextAdapter,
  createOpenRouterText,
  openrouterText,
  type OpenRouterConfig,
  type OpenRouterTextProviderOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  OpenRouterSummarizeAdapter,
  createOpenRouterSummarize,
  openrouterSummarize,
  type OpenRouterSummarizeConfig,
  type OpenRouterSummarizeProviderOptions,
} from './adapters/summarize'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  OpenRouterChatModelProviderOptionsByName,
  OpenRouterModelInputModalitiesByName,
} from './model-meta'
export type {
  OpenRouterTextMetadata,
  OpenRouterImageMetadata,
  OpenRouterAudioMetadata,
  OpenRouterVideoMetadata,
  OpenRouterDocumentMetadata,
  OpenRouterMessageMetadataByModality,
} from './message-types'
export type {
  WebPlugin,
  ProviderPreferences,
  ReasoningOptions,
  StreamOptions,
  ImageConfig,
} from './text/text-provider-options'

// Export tool conversion utilities
export { convertToolsToProviderFormat } from './tools/tool-converter'

// Export tool types
export type { OpenRouterTool, FunctionTool } from './tools'
