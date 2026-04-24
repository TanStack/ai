// ============================================================================
// New Tree-Shakeable Adapters (Recommended)
// ============================================================================

// Text (Chat) adapter - for chat/text completion
export {
  OpenRouterTextAdapter,
  createOpenRouterText,
  openRouterText,
  type OpenRouterConfig,
  type OpenRouterTextModelOptions,
} from './adapters/text'

// Summarize adapter - for text summarization
export {
  OpenRouterSummarizeAdapter,
  createOpenRouterSummarize,
  openRouterSummarize,
  type OpenRouterSummarizeConfig,
  type OpenRouterSummarizeProviderOptions,
} from './adapters/summarize'

// Image adapter - for image generation
export {
  OpenRouterImageAdapter,
  createOpenRouterImage,
  openRouterImage,
  type OpenRouterImageConfig,
} from './adapters/image'
export type {
  OpenRouterImageProviderOptions,
  OpenRouterImageModelProviderOptionsByName,
  OpenRouterImageModelSizeByName,
} from './image/image-provider-options'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  OpenRouterModelOptionsByName,
  OpenRouterModelInputModalitiesByName,
  OpenRouterChatModelToolCapabilitiesByName,
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
  PluginResponseHealing,
  PdfParserOptions,
  PluginFileParser,
  PluginModeration,
  PluginAutoRouter,
  Plugin,
  ProviderPreferences,
  ReasoningOptions,
  StreamOptions,
  ImageConfig,
} from './text/text-provider-options'

// ============================================================================
// Utils Exports
// ============================================================================

export {
  getOpenRouterApiKeyFromEnv,
  generateId,
  buildHeaders,
  type OpenRouterClientConfig,
} from './utils'

// ============================================================================
// Tool Exports
// ============================================================================

export { convertToolsToProviderFormat } from './tools/tool-converter'

export type { OpenRouterTool, FunctionTool } from './tools'
