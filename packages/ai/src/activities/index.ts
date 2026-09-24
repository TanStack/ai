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
import type { AnyAudioAdapter } from './generateAudio/adapter'
import type { AnyVideoAdapter } from './generateVideo/adapter'
import type { AnyTTSAdapter } from './generateSpeech/adapter'
import type { AnyVoiceAdapter } from './generateVoice/adapter'
import type { AnyTranscriptionAdapter } from './generateTranscription/adapter'
import type { AnyEmbeddingAdapter } from './embed/adapter'
import type { AnyRerankAdapter } from './rerank/adapter'
import type { AnyEvaluateAdapter } from './evaluate/adapter'
import type { AnyWorldAdapter } from './generateWorld/adapter'
import type { AnyLiveVideoAdapter } from './generateLiveVideo/adapter'

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
  defineAgent,
  type DefinedAgent,
  type SubagentChoiceOptions,
  type SubagentRunContext,
} from './chat/agents/define-agent'
export { subagentRoute, type SubagentRouteOptions } from './chat/agents/route'
export type {
  SubagentOrder,
  SubagentRouterPick,
  SubagentRouterPlan,
  SubagentStep,
  SubagentStepsPlan,
} from './chat/agents/spawn'

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
export {
  ChatStreamSummarizeAdapter,
  type ChatStreamCapable,
  type InferTextProviderOptions,
} from './summarize/chat-stream-summarize'

// ===========================
// Rerank Activity
// ===========================

export {
  kind as rerankKind,
  rerank,
  createRerankOptions,
  type RerankActivityOptions,
  type RerankProviderOptions,
} from './rerank/index'

export {
  BaseRerankAdapter,
  type RerankAdapter,
  type RerankAdapterConfig,
  type AnyRerankAdapter,
} from './rerank/adapter'

// ===========================
// Evaluate Activity
// ===========================

export {
  kind as evaluateKind,
  decide,
  choice,
  score,
  boolean,
  type EvaluateActivityOptions,
  type EvaluateResult,
  type EvaluateResultMeta,
  type EvaluateProviderOptions,
  type ChoiceAnswer,
  type ScoreAnswer,
  type BooleanAnswer,
  type InferEvaluateAnswer,
} from './evaluate/index'

export {
  BaseEvaluateAdapter,
  type EvaluateAdapter,
  type EvaluateAdapterConfig,
  type AnyEvaluateAdapter,
  type EvaluateOptions,
  type EvaluateAdapterResult,
  type EvaluateState,
  type EvaluateInstructions,
  type EvaluateJsonValue,
  type WireQuestion,
  type WireAnswer,
  type WireChoiceQuestion,
  type WireScoreQuestion,
  type WireNoulQuestion,
  type WireChoiceAnswer,
  type WireScoreAnswer,
  type WireNoulAnswer,
} from './evaluate/adapter'

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
// Audio Activity
// ===========================

export {
  kind as audioKind,
  generateAudio,
  type AudioActivityOptions,
  type AudioActivityResult,
  type AudioProviderOptions,
} from './generateAudio/index'

export {
  BaseAudioAdapter,
  type AudioAdapter,
  type AudioAdapterConfig,
  type AnyAudioAdapter,
} from './generateAudio/adapter'

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
  type VideoDurationForAdapter,
} from './generateVideo/index'

export {
  BaseVideoAdapter,
  type VideoAdapter,
  type VideoAdapterConfig,
  type AnyVideoAdapter,
  type DurationOptions,
} from './generateVideo/adapter'

export { snapToDurationOption } from './generateVideo/snap'

// ===========================
// TTS Activity
// ===========================

export {
  kind as ttsKind,
  generateSpeech,
  listVoices,
  type ListVoicesActivityOptions,
  type TTSActivityOptions,
  type TTSActivityResult,
  type TTSProviderOptions,
} from './generateSpeech/index'

export {
  BaseTTSAdapter,
  type TTSAdapter,
  type TTSAdapterConfig,
  type TTSCapabilities,
  type AnyTTSAdapter,
} from './generateSpeech/adapter'

// ===========================
// Voice Activity
// ===========================

export {
  kind as voiceKind,
  generateVoice,
  createVoiceOptions,
  type VoiceActivityOptions,
  type VoiceActivityResult,
  type VoiceProviderOptions,
} from './generateVoice/index'

export {
  BaseVoiceAdapter,
  type VoiceAdapter,
  type VoiceAdapterConfig,
  type AnyVoiceAdapter,
} from './generateVoice/adapter'

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
// Embed Activity
// ===========================

export {
  kind as embeddingKind,
  embed,
  type EmbedOptions,
  type EmbedProviderOptionsForModel,
  type EmbeddingInputForModel,
} from './embed/index'

export {
  BaseEmbeddingAdapter,
  type EmbeddingAdapter,
  type EmbeddingAdapterConfig,
  type AnyEmbeddingAdapter,
} from './embed/adapter'

// ===========================
// World Activity (Experimental)
// ===========================

export {
  kind as worldKind,
  generateWorld,
  type WorldActivityOptions,
  type WorldActivityResult,
  type WorldProviderOptions,
} from './generateWorld/index'

export {
  BaseWorldAdapter,
  type WorldAdapter,
  type WorldAdapterConfig,
  type AnyWorldAdapter,
} from './generateWorld/adapter'

// ===========================
// Live Activity (Experimental)
// ===========================

export {
  kind as liveVideoKind,
  generateLiveVideo,
  type LiveVideoActivityOptions,
  type LiveVideoActivityResult,
  type LiveVideoProviderOptions,
} from './generateLiveVideo/index'

export {
  BaseLiveVideoAdapter,
  type LiveVideoAdapter,
  type LiveVideoAdapterConfig,
  type AnyLiveVideoAdapter,
} from './generateLiveVideo/adapter'

// ===========================
// Adapter Union Types
// ===========================

/** Union of all adapter types that can be passed to chat() */
export type AIAdapter =
  | AnyTextAdapter
  | AnySummarizeAdapter
  | AnyImageAdapter
  | AnyAudioAdapter
  | AnyVideoAdapter
  | AnyTTSAdapter
  | AnyVoiceAdapter
  | AnyTranscriptionAdapter
  | AnyEmbeddingAdapter
  | AnyRerankAdapter
  | AnyEvaluateAdapter
  | AnyWorldAdapter
  | AnyLiveVideoAdapter

/** Union type of all adapter kinds */
export type AdapterKind =
  | 'text'
  | 'summarize'
  | 'image'
  | 'audio'
  | 'video'
  | 'tts'
  | 'voice'
  | 'transcription'
  | 'embedding'
  | 'rerank'
  | 'evaluate'
  | 'world'
  | 'liveVideo'
