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

// Responses (beta) adapter - for the OpenRouter beta Responses API
export {
  OpenRouterResponsesTextAdapter,
  createOpenRouterResponsesText,
  openRouterResponsesText,
  type OpenRouterResponsesConfig,
  type OpenRouterResponsesTextProviderOptions,
} from './adapters/responses-text'

// Summarize - thin factory functions over @tanstack/ai's ChatStreamSummarizeAdapter
export {
  createOpenRouterSummarize,
  openRouterSummarize,
  type OpenRouterSummarizeConfig,
  type OpenRouterTextModels as OpenRouterSummarizeModel,
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
