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

// Types
export type {
  MistralChatModelProviderOptionsByName,
  MistralModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  MistralChatModels,
} from './model-meta'
export { MISTRAL_CHAT_MODELS } from './model-meta'
export type {
  MistralTextMetadata,
  MistralImageMetadata,
  MistralAudioMetadata,
  MistralVideoMetadata,
  MistralDocumentMetadata,
  MistralMessageMetadataByModality,
} from './message-types'
