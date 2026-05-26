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

// Transcription adapter
export {
  GroqTranscriptionAdapter,
  createGroqTranscription,
  groqTranscription,
  type GroqTranscriptionConfig,
} from './adapters/transcription'
export type { GroqTranscriptionProviderOptions } from './audio/transcription-provider-options'

// Types
export type {
  GroqChatModelProviderOptionsByName,
  GroqChatModelToolCapabilitiesByName,
  GroqModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  GroqChatModels,
  GroqTranscriptionModel,
} from './model-meta'
export { GROQ_CHAT_MODELS, GROQ_TRANSCRIPTION_MODELS } from './model-meta'
export type {
  GroqTextMetadata,
  GroqImageMetadata,
  GroqAudioMetadata,
  GroqVideoMetadata,
  GroqDocumentMetadata,
  GroqMessageMetadataByModality,
} from './message-types'
