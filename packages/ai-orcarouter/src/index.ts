/**
 * @module @tanstack/ai-orcarouter
 *
 * OrcaRouter provider adapter for TanStack AI.
 * Provides tree-shakeable adapters for OrcaRouter's OpenAI-compatible Chat
 * Completions API, which routes one endpoint to many models across providers
 * with adaptive routing, automatic failover, zero-markup inference,
 * observability, guardrails, and agent-tool governance.
 */

// Text (Chat) adapter
export {
  OrcaRouterTextAdapter,
  createOrcaRouterText,
  orcaRouterText,
  type OrcaRouterTextConfig,
  type OrcaRouterTextProviderOptions,
} from './adapters/text'

// Summarize - thin factory functions over @tanstack/ai's ChatStreamSummarizeAdapter
export {
  createOrcaRouterSummarize,
  orcaRouterSummarize,
  type OrcaRouterSummarizeConfig,
  type OrcaRouterSummarizeModel,
} from './adapters/summarize'

// Types
export type {
  OrcaRouterChatModelProviderOptionsByName,
  OrcaRouterChatModelToolCapabilitiesByName,
  OrcaRouterModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  OrcaRouterChatModels,
  OrcaRouterModelId,
} from './model-meta'
export { ORCAROUTER_CHAT_MODELS } from './model-meta'
export type {
  OrcaRouterTextMetadata,
  OrcaRouterImageMetadata,
  OrcaRouterAudioMetadata,
  OrcaRouterVideoMetadata,
  OrcaRouterDocumentMetadata,
  OrcaRouterMessageMetadataByModality,
} from './message-types'

// Utils
export {
  getOrcaRouterApiKeyFromEnv,
  withOrcaRouterDefaults,
  type OrcaRouterClientConfig,
} from './utils/client'
