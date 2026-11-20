/**
 * @module @tanstack/ai-muse
 *
 * Muse provider adapter for TanStack AI.
 * Provides a tree-shakeable adapter for Muse's OpenAI-compatible Chat
 * Completions endpoint, including the flagship `muse-ember-1.0` (Ember) model.
 */

// Text (Chat) adapter
export {
  MuseTextAdapter,
  createMuseText,
  museText,
  type MuseTextConfig,
  type MuseTextProviderOptions,
} from './adapters/text'

// Types
export type {
  MuseChatModels,
  MuseChatModelProviderOptionsByName,
  MuseChatModelToolCapabilitiesByName,
  MuseModelInputModalitiesByName,
  MuseModelReasoningByName,
  ResolveProviderOptions,
  ResolveInputModalities,
} from './model-meta'
export { MUSE_CHAT_MODELS } from './model-meta'
export type {
  MuseTextMetadata,
  MuseImageMetadata,
  MuseAudioMetadata,
  MuseVideoMetadata,
  MuseDocumentMetadata,
  MuseMessageMetadataByModality,
} from './message-types'
