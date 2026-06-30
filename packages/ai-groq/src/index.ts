/**
 * @module @tanstack/ai-groq
 *
 * Groq provider adapter for TanStack AI.
 * Provides tree-shakeable adapters for Groq's Chat Completions API.
 */

// Text (Chat) adapter
export {
  GroqTextAdapter,
  createGroqText,
  groqText,
  type GroqTextConfig,
  type GroqTextProviderOptions,
} from './adapters/text'

// Summarize - thin factory functions over @tanstack/ai's ChatStreamSummarizeAdapter
export {
  createGroqSummarize,
  groqSummarize,
  type GroqSummarizeConfig,
  type GroqSummarizeModel,
} from './adapters/summarize'

// Types
export type {
  GroqChatModelProviderOptionsByName,
  GroqChatModelToolCapabilitiesByName,
  GroqModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  GroqChatModels,
} from './model-meta'
export { GROQ_CHAT_MODELS } from './model-meta'
export type {
  GroqTextMetadata,
  GroqImageMetadata,
  GroqAudioMetadata,
  GroqVideoMetadata,
  GroqDocumentMetadata,
  GroqMessageMetadataByModality,
} from './message-types'
