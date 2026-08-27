// Import the activity functions

// Import adapter types for type definitions
import type { AnyTextAdapter } from './chat/adapter'
import type { AnySummarizeAdapter } from './summarize/adapter'
import type { AnyImageAdapter } from './generateImage/adapter'
import type { AnyAudioAdapter } from './generateAudio/adapter'
import type { AnyVideoAdapter } from './generateVideo/adapter'
import type { AnyTTSAdapter } from './generateSpeech/adapter'
import type { AnyTranscriptionAdapter } from './generateTranscription/adapter'
import type { AnyEmbeddingAdapter } from './embed/adapter'
import type { AnyRerankAdapter } from './rerank/adapter'

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

/** Union of all adapter types that can be passed to chat() */
export type AIAdapter =
  | AnyTextAdapter
  | AnySummarizeAdapter
  | AnyImageAdapter
  | AnyAudioAdapter
  | AnyVideoAdapter
  | AnyTTSAdapter
  | AnyTranscriptionAdapter
  | AnyEmbeddingAdapter
  | AnyRerankAdapter

/** Union type of all adapter kinds */
export type AdapterKind =
  | 'text'
  | 'summarize'
  | 'image'
  | 'audio'
  | 'video'
  | 'tts'
  | 'transcription'
  | 'embedding'
  | 'rerank'
