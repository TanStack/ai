// Text (Chat) adapter
export {
  ZAITextAdapter,
  createZAIChat,
  zaiText,
  type ZAITextAdapterConfig,
} from './adapters/index'

// Summarize adapter
export {
  ZAISummarizeAdapter,
  createZAISummarize,
  zaiSummarize,
  type ZAISummarizeConfig,
  type ZAISummarizeProviderOptions,
} from './adapters/index'

// Config types
export type { ZAIAdapterConfig, ZAIModel } from './adapters/index'

// Endpoint constants
export { ZAI_GENERAL_BASE_URL, ZAI_CODING_BASE_URL } from './utils/client'

// Model metadata types
export type {
  ZAIChatModel,
  ZAIChatModelProviderOptionsByName,
  ZAIChatModelToolCapabilitiesByName,
  ZAIModelInputModalitiesByName,
} from './model-meta'

// Message metadata types
export type { ZAIMessageMetadataByModality } from './message-types'

// Tools
export * from './tools/index'
