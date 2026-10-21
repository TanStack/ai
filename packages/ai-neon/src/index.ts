/**
 * @module @tanstack/ai-neon
 *
 * Neon AI Gateway adapter for TanStack AI. One Neon credential reaches every
 * model in the gateway catalog; `neonText` sends each model to the route
 * that serves it.
 */

export {
  createNeonText,
  neonText,
  type NeonAnthropicTextAdapter,
  type NeonAnthropicTextConfig,
  type NeonChatApiConfig,
  type NeonResponsesApiConfig,
} from './adapters/factory'

export { NeonTextAdapter, type NeonTextConfig } from './adapters/text'

export {
  NeonResponsesTextAdapter,
  type NeonResponsesTextConfig,
} from './adapters/responses-text'

export {
  NeonEmbeddingAdapter,
  createNeonEmbedding,
  neonEmbedding,
  type NeonEmbeddingConfig,
  type NeonEmbeddingProviderOptions,
} from './adapters/embedding'

export {
  createNeonSummarize,
  neonSummarize,
  type NeonSummarizeConfig,
  type NeonSummarizeProviderOptions,
} from './adapters/summarize'

export type {
  NeonResponsesProviderOptions,
  NeonTextProviderOptions,
} from './text/text-provider-options'

export {
  NEON_ANTHROPIC_MODELS,
  NEON_CHAT_MODELS,
  NEON_EMBEDDING_MODELS,
  NEON_RESPONSES_MODELS,
  NEON_RESPONSES_ONLY_MODELS,
} from './model-meta'
export type {
  NeonAnthropicModel,
  NeonChatModel,
  NeonEmbeddingModel,
  NeonModelInputModalitiesByName,
  NeonModelReasoningByName,
  NeonResponsesModel,
  NeonResponsesOnlyModel,
} from './model-meta'

export {
  getNeonTokenFromEnv,
  resolveNeonHost,
  type NeonClientConfig,
} from './utils/client'
