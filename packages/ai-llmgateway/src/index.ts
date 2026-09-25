/**
 * @module @tanstack/ai-llmgateway
 *
 * LLM Gateway provider adapter for TanStack AI.
 * Provides tree-shakeable adapters for LLM Gateway's OpenAI-compatible Chat
 * Completions API, which routes one endpoint to hundreds of models across
 * many providers.
 */

// Text (Chat) adapter
export {
  LLMGatewayTextAdapter,
  createLLMGatewayText,
  llmGatewayText,
  type LLMGatewayTextConfig,
  type LLMGatewayTextProviderOptions,
} from './adapters/text'

// Summarize - thin factory functions over @tanstack/ai's ChatStreamSummarizeAdapter
export {
  createLLMGatewaySummarize,
  llmGatewaySummarize,
  type LLMGatewaySummarizeConfig,
  type LLMGatewaySummarizeModel,
} from './adapters/summarize'

// Types
export type {
  LLMGatewayChatModelProviderOptionsByName,
  LLMGatewayChatModelToolCapabilitiesByName,
  LLMGatewayModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  LLMGatewayChatModels,
  LLMGatewayModelId,
} from './model-meta'
export { LLMGATEWAY_CHAT_MODELS } from './model-meta'
export type {
  LLMGatewayTextMetadata,
  LLMGatewayImageMetadata,
  LLMGatewayAudioMetadata,
  LLMGatewayVideoMetadata,
  LLMGatewayDocumentMetadata,
  LLMGatewayMessageMetadataByModality,
} from './message-types'

// Utils
export {
  getLLMGatewayApiKeyFromEnv,
  withLLMGatewayDefaults,
  type LLMGatewayClientConfig,
} from './utils/client'
