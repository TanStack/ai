/**
 * Activities Index
 *
 * Central hub for all AI activities. This module exports:
 * - All activity implementations and their types
 * - All adapter interfaces and base classes
 * - Unified type definitions
 *
 * To add a new activity:
 * 1. Create a new directory under activities/ with index.ts and adapter.ts
 * 2. Export the activity and adapter from this file
 */

// Import the activity functions

// Import adapter types for type definitions
import type { AnyTextAdapter } from './chat/adapter'
import type { AnySummarizeAdapter } from './summarize/adapter'
import type { AnyImageAdapter } from './generateImage/adapter'
import type { AnyMusicAdapter } from './generateMusic/adapter'
import type { AnySoundEffectsAdapter } from './generateSoundEffects/adapter'
import type { AnyVideoAdapter } from './generateVideo/adapter'
import type { AnyTTSAdapter } from './generateSpeech/adapter'
import type { AnyTranscriptionAdapter } from './generateTranscription/adapter'

// ===========================
// Chat Activity
// ===========================

export {
  kind as textKind,
  chat,
  type TextActivityOptions,
  type TextActivityResult,
} from './chat/index'

export {
  BaseTextAdapter,
  type AnyTextAdapter,
  type TextAdapter,
  type TextAdapterConfig,
  type StructuredOutputOptions,
  type StructuredOutputResult,
} from './chat/adapter'

// ===========================
// Summarize Activity
// ===========================

export {
  kind as summarizeKind,
  summarize,
  type SummarizeActivityOptions,
  type SummarizeActivityResult,
  type SummarizeProviderOptions,
} from './summarize/index'

export {
  BaseSummarizeAdapter,
  type SummarizeAdapter,
  type SummarizeAdapterConfig,
  type AnySummarizeAdapter,
} from './summarize/adapter'

// ===========================
// Image Activity
// ===========================

export {
  kind as imageKind,
  generateImage,
  type ImageActivityOptions,
  type ImageActivityResult,
  type ImageProviderOptionsForModel,
  type ImageSizeForModel,
} from './generateImage/index'

export {
  BaseImageAdapter,
  type ImageAdapter,
  type ImageAdapterConfig,
  type AnyImageAdapter,
} from './generateImage/adapter'

// ===========================
// Music Activity
// ===========================

export {
  kind as musicKind,
  generateMusic,
  type MusicActivityOptions,
  type MusicActivityResult,
  type MusicProviderOptions,
} from './generateMusic/index'

export {
  BaseMusicAdapter,
  type MusicAdapter,
  type MusicAdapterConfig,
  type AnyMusicAdapter,
} from './generateMusic/adapter'

// ===========================
// Sound Effects Activity
// ===========================

export {
  kind as soundEffectsKind,
  generateSoundEffects,
  type SoundEffectsActivityOptions,
  type SoundEffectsActivityResult,
  type SoundEffectsProviderOptions,
} from './generateSoundEffects/index'

export {
  BaseSoundEffectsAdapter,
  type SoundEffectsAdapter,
  type SoundEffectsAdapterConfig,
  type AnySoundEffectsAdapter,
} from './generateSoundEffects/adapter'

// ===========================
// Video Activity (Experimental)
// ===========================

export {
  kind as videoKind,
  generateVideo,
  getVideoJobStatus,
  type VideoActivityOptions,
  type VideoActivityResult,
  type VideoProviderOptions,
  type VideoCreateOptions,
  type VideoStatusOptions,
  type VideoUrlOptions,
} from './generateVideo/index'

export {
  BaseVideoAdapter,
  type VideoAdapter,
  type VideoAdapterConfig,
  type AnyVideoAdapter,
} from './generateVideo/adapter'

// ===========================
// TTS Activity
// ===========================

export {
  kind as ttsKind,
  generateSpeech,
  type TTSActivityOptions,
  type TTSActivityResult,
  type TTSProviderOptions,
} from './generateSpeech/index'

export {
  BaseTTSAdapter,
  type TTSAdapter,
  type TTSAdapterConfig,
  type AnyTTSAdapter,
} from './generateSpeech/adapter'

// ===========================
// Transcription Activity
// ===========================

export {
  kind as transcriptionKind,
  generateTranscription,
  type TranscriptionActivityOptions,
  type TranscriptionActivityResult,
  type TranscriptionProviderOptions,
} from './generateTranscription/index'

export {
  BaseTranscriptionAdapter,
  type TranscriptionAdapter,
  type TranscriptionAdapterConfig,
  type AnyTranscriptionAdapter,
} from './generateTranscription/adapter'

// ===========================
// Adapter Union Types
// ===========================

/** Union of all adapter types that can be passed to chat() */
export type AIAdapter =
  | AnyTextAdapter
  | AnySummarizeAdapter
  | AnyImageAdapter
  | AnyMusicAdapter
  | AnySoundEffectsAdapter
  | AnyVideoAdapter
  | AnyTTSAdapter
  | AnyTranscriptionAdapter

/** Union type of all adapter kinds */
export type AdapterKind =
  | 'text'
  | 'summarize'
  | 'image'
  | 'music'
  | 'sound-effects'
  | 'video'
  | 'tts'
  | 'transcription'
