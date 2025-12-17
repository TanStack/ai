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
import type { SummarizeAdapter } from './summarize/adapter'
import type { ImageAdapter } from './generateImage/adapter'
import type { VideoAdapter } from './generateVideo/adapter'
import type { TTSAdapter } from './generateSpeech/adapter'
import type { TranscriptionAdapter } from './generateTranscription/adapter'

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
  type SummarizeModels,
  type SummarizeProviderOptions,
} from './summarize/index'

export {
  BaseSummarizeAdapter,
  type SummarizeAdapter,
  type SummarizeAdapterConfig,
} from './summarize/adapter'

// ===========================
// Image Activity
// ===========================

export {
  kind as imageKind,
  generateImage,
  type ImageActivityOptions,
  type ImageActivityResult,
  type ImageModels,
  type ImageProviderOptionsForModel,
  type ImageSizeForModel,
} from './generateImage/index'

export {
  BaseImageAdapter,
  type ImageAdapter,
  type ImageAdapterConfig,
} from './generateImage/adapter'

// ===========================
// Video Activity (Experimental)
// ===========================

export {
  kind as videoKind,
  generateVideo,
  getVideoJobStatus,
  type VideoActivityOptions,
  type VideoActivityResult,
  type VideoModels,
  type VideoProviderOptions,
  type VideoCreateOptions,
  type VideoStatusOptions,
  type VideoUrlOptions,
} from './generateVideo/index'

export {
  BaseVideoAdapter,
  type VideoAdapter,
  type VideoAdapterConfig,
} from './generateVideo/adapter'

// ===========================
// TTS Activity
// ===========================

export {
  kind as ttsKind,
  generateSpeech,
  type TTSActivityOptions,
  type TTSActivityResult,
  type TTSModels,
  type TTSProviderOptions,
} from './generateSpeech/index'

export {
  BaseTTSAdapter,
  type TTSAdapter,
  type TTSAdapterConfig,
} from './generateSpeech/adapter'

// ===========================
// Transcription Activity
// ===========================

export {
  kind as transcriptionKind,
  generateTranscription,
  type TranscriptionActivityOptions,
  type TranscriptionActivityResult,
  type TranscriptionModels,
  type TranscriptionProviderOptions,
} from './generateTranscription/index'

export {
  BaseTranscriptionAdapter,
  type TranscriptionAdapter,
  type TranscriptionAdapterConfig,
} from './generateTranscription/adapter'

// ===========================
// Adapter Union Types
// ===========================

/** Union of all adapter types that can be passed to chat() */
export type AIAdapter =
  | AnyTextAdapter
  | SummarizeAdapter<ReadonlyArray<string>, object, any>
  | ImageAdapter<ReadonlyArray<string>, object, any, any, any>
  | VideoAdapter<ReadonlyArray<string>, object, any>
  | TTSAdapter<ReadonlyArray<string>, object, any>
  | TranscriptionAdapter<ReadonlyArray<string>, object, any>

/** Union type of all adapter kinds */
export type AdapterKind =
  | 'text'
  | 'summarize'
  | 'image'
  | 'video'
  | 'tts'
  | 'transcription'
