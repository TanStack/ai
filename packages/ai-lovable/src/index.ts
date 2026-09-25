/**
 * @module @tanstack/ai-lovable
 *
 * Lovable AI Gateway adapter for TanStack AI.
 */

export {
  LovableTextAdapter,
  type LovableTextConfig,
  type LovableTextProviderOptions,
} from './adapters/text'

export {
  createLovableText,
  lovableText,
  type LovableTextApi,
  type LovableResponsesApiConfig,
  type LovableChatApiConfig,
} from './adapters/factory'

export {
  LovableResponsesTextAdapter,
  createLovableResponsesText,
  lovableResponsesText,
  type LovableResponsesTextConfig,
  type LovableResponsesTextProviderOptions,
} from './adapters/responses-text'

export {
  createLovableSummarize,
  lovableSummarize,
  type LovableSummarizeConfig,
  type LovableSummarizeModel,
} from './adapters/summarize'

export {
  LovableEmbeddingAdapter,
  createLovableEmbedding,
  lovableEmbedding,
  type LovableEmbeddingConfig,
} from './adapters/embedding'
export type { LovableEmbeddingProviderOptions } from './embedding/embedding-provider-options'

export {
  LovableImageAdapter,
  createLovableImage,
  lovableImage,
  type LovableImageConfig,
} from './adapters/image'
export type { LovableImageProviderOptions } from './image/image-provider-options'

/**
 * @experimental Video generation is an experimental feature and may change.
 */
export {
  LovableVideoAdapter,
  createLovableVideo,
  lovableVideo,
  type LovableVideoConfig,
} from './adapters/video'
export type {
  LovableVideoProviderOptions,
  LovableVideoSize,
  LovableHdVideoSize,
  Lovable4kVideoSize,
  LovableVideoDuration,
  LovableVideoSeconds,
} from './video/video-provider-options'

export {
  LovableTTSAdapter,
  createLovableSpeech,
  lovableSpeech,
  type LovableTTSConfig,
} from './adapters/tts'
export type {
  LovableTTSProviderOptions,
  LovableTTSVoice,
  LovableTTSFormat,
} from './audio/tts-provider-options'

export {
  LovableTranscriptionAdapter,
  createLovableTranscription,
  lovableTranscription,
  type LovableTranscriptionConfig,
} from './adapters/transcription'
export type { LovableTranscriptionProviderOptions } from './audio/transcription-provider-options'

export {
  LOVABLE_CHAT_MODELS,
  LOVABLE_IMAGE_MODELS,
  LOVABLE_VIDEO_MODELS,
  LOVABLE_EMBEDDING_MODELS,
  LOVABLE_TTS_MODELS,
  LOVABLE_TRANSCRIPTION_MODELS,
} from './model-meta'
export type {
  LovableChatModel,
  LovableModelId,
  LovableChatModelProviderOptionsByName,
  LovableModelInputModalitiesByName,
  LovableImageModel,
  LovableVideoModel,
  LovableEmbeddingModel,
  LovableTTSModel,
  LovableTranscriptionModel,
  ResolveProviderOptions,
  ResolveInputModalities,
} from './model-meta'

export type {
  LovableTextMetadata,
  LovableImageMetadata,
  LovableAudioMetadata,
  LovableVideoMetadata,
  LovableDocumentMetadata,
  LovableMessageMetadataByModality,
} from './message-types'

export {
  getLovableApiKeyFromEnv,
  lovableGatewayHeaders,
  type LovableClientConfig,
} from './utils/client'
