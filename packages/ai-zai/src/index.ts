// Text (Chat) adapter
export {
  ZAITextAdapter,
  createZAIText,
  zaiText,
  type ZAITextConfig,
  type ZAITextProviderOptions,
} from './adapters/index'

// Summarize adapter
export {
  type ZAISummarizeAdapter,
  createZAISummarize,
  zaiSummarize,
  type ZAISummarizeConfig,
  type ZAISummarizeModel,
  type ZAISummarizeProviderOptions,
} from './adapters/index'

// Endpoint constants
export { ZAI_GENERAL_BASE_URL, ZAI_CODING_BASE_URL } from './utils/client'

// Model metadata types
export type {
  ZAIChatModel,
  ZAIChatModelProviderOptionsByName,
  ZAIChatModelToolCapabilitiesByName,
  ZAIModelInputModalitiesByName,
  ZAIModelReasoningByName,
  ZAIProviderToolKind,
  ResolveProviderOptions,
  ResolveInputModalities,
} from './model-meta'

// Message metadata types
export type { ZAIMessageMetadataByModality } from './message-types'

// Tools
export * from './tools/index'
