/**
 * @module @tanstack/ai-groq
 *
 * Groq provider adapter for TanStack AI.
 * Provides tree-shakeable adapters for Groq's Chat Completions API and TTS API.
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

// Transcription adapter
export {
  GroqTranscriptionAdapter,
  createGroqTranscription,
  groqTranscription,
  type GroqTranscriptionConfig,
} from './adapters/transcription'
export type { GroqTranscriptionProviderOptions } from './audio/transcription-provider-options'

// TTS adapter - for text-to-speech
export {
  GroqTTSAdapter,
  createGroqSpeech,
  groqSpeech,
  type GroqTTSConfig,
} from './adapters/tts'
export type {
  GroqTTSProviderOptions,
  GroqTTSVoice,
  GroqTTSEnglishVoice,
  GroqTTSArabicVoice,
  GroqTTSFormat,
  GroqTTSSampleRate,
} from './audio/tts-provider-options'


// Types
export type {
  GroqChatModelProviderOptionsByName,
  GroqTTSModelProviderOptionsByName,
  GroqChatModelToolCapabilitiesByName,
  GroqModelInputModalitiesByName,
  ResolveProviderOptions,
  ResolveInputModalities,
  GroqChatModels,
  GroqTranscriptionModel,
  GroqTTSModel,
} from './model-meta'
export {
  GROQ_CHAT_MODELS,
  GROQ_TRANSCRIPTION_MODELS,
  GROQ_TTS_MODELS,
} from './model-meta'
export type {
  GroqTextMetadata,
  GroqImageMetadata,
  GroqAudioMetadata,
  GroqVideoMetadata,
  GroqDocumentMetadata,
  GroqMessageMetadataByModality,
} from './message-types'
