/**
 * @module @tanstack/ai-mistral
 *
 * Mistral provider adapter for TanStack AI.
 * Provides tree-shakeable adapters for Mistral's Chat Completions API.
 */

// Text (Chat) adapter
export {
  MistralTextAdapter,
  createMistralText,
  mistralText,
  type MistralTextConfig,
  type MistralTextProviderOptions,
} from './adapters/text'

// Embedding adapter - for embedding vectors
export {
  MistralEmbeddingAdapter,
  createMistralEmbedding,
  mistralEmbedding,
  type MistralEmbeddingConfig,
} from './adapters/embedding'
export type {
  MistralEmbeddingProviderOptions,
  MistralEmbedProviderOptions,
  CodestralEmbedProviderOptions,
} from './embedding/embedding-provider-options'

// Types
export type {
  MistralChatModelProviderOptionsByName,
  MistralModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  MistralChatModels,
  MistralEmbeddingModel,
  MistralEmbeddingModelProviderOptionsByName,
  MistralEmbeddingModelInputModalitiesByName,
} from './model-meta'
export { MISTRAL_CHAT_MODELS, MISTRAL_EMBEDDING_MODELS } from './model-meta'
export type {
  MistralTextMetadata,
  MistralImageMetadata,
  MistralAudioMetadata,
  MistralVideoMetadata,
  MistralDocumentMetadata,
  MistralMessageMetadataByModality,
} from './message-types'
