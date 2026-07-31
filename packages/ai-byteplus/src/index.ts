// ============================================================================
// Adapters
// ============================================================================
//
// Tree-shakeable adapters live in ./adapters and are re-exported here, one
// block per generation kind:
//
//   - text          → ./adapters/text          (Seed chat models on Ark)
//   - video         → ./adapters/video         (Seedance task API)
//   - image         → ./adapters/image         (Seedream)
//   - speech        → ./adapters/tts           (Seed Speech TTS)
//   - transcription → ./adapters/transcription (Seed Speech ASR)
//
export {
  BytePlusVideoAdapter,
  byteplusVideo,
  createBytePlusVideo,
} from './adapters/video'
export type { BytePlusVideoConfig } from './adapters/video'
export {
  parseBytePlusVideoSize,
  resolveBytePlusVideoSize,
  supportsLastFrame,
  supportsReferenceMedia,
} from './video/video-provider-options'
export type {
  BytePlusVideoModelProviderOptionsByName,
  BytePlusVideoProviderOptions,
  BytePlusVideoServiceTier,
} from './video/video-provider-options'
export type {
  BytePlusVideoContentPart,
  BytePlusVideoContentRole,
  BytePlusVideoCreateRequest,
  BytePlusVideoCreateResponse,
  BytePlusVideoTask,
  BytePlusVideoTaskContent,
  BytePlusVideoTaskError,
  BytePlusVideoTaskListItem,
  BytePlusVideoTaskListResponse,
  BytePlusVideoTaskStatus,
  BytePlusVideoTaskUsage,
} from './video/wire-types'
export {
  BYTEPLUS_DEFAULT_TTS_SPEAKER,
  BYTEPLUS_TTS_MAX_OUTPUT_SECONDS,
  BytePlusTTSAdapter,
  byteplusSpeech,
  createBytePlusSpeech,
  toSpeechRate,
} from './adapters/tts'
export type {
  BytePlusTTSProviderOptions,
  BytePlusTTSResult,
  BytePlusTTSVoice,
} from './audio/tts-provider-options'
export {
  BytePlusTranscriptionAdapter,
  byteplusTranscription,
  createBytePlusTranscription,
} from './adapters/transcription'
export type { BytePlusTranscriptionWord } from './adapters/transcription'
export type { BytePlusTranscriptionProviderOptions } from './audio/transcription-provider-options'
export {
  BYTEPLUS_ASR_RESOURCE_HEADER,
  BYTEPLUS_ASR_RESOURCE_ID,
} from './audio/wire-types'
export type {
  BytePlusASRAudio,
  BytePlusASRRecognizeRequest,
  BytePlusASRRecognizeResponse,
  BytePlusASRResult,
  BytePlusASRUtterance,
  BytePlusASRWord,
  BytePlusTTSAudioConfig,
  BytePlusTTSAudioFormat,
  BytePlusTTSCreateRequest,
  BytePlusTTSCreateResponse,
  BytePlusTTSSubtitleEntry,
  BytePlusVoiceErrorBody,
} from './audio/wire-types'
export {
  BytePlusImageAdapter,
  byteplusImage,
  createBytePlusImage,
} from './adapters/image'
export type { BytePlusImageConfig } from './adapters/image'
export {
  BYTEPLUS_IMAGE_MAX_PROMPT_WORDS,
  BYTEPLUS_IMAGE_MAX_SEQUENTIAL_IMAGES,
  BYTEPLUS_OUTPUT_FORMAT_IMAGE_MODELS,
  parseBytePlusImageSize,
} from './image/image-provider-options'
export type {
  BytePlusImageBaseProviderOptions,
  BytePlusImageModelInputModalitiesByName,
  BytePlusImageModelProviderOptionsByName,
  BytePlusImageProviderOptions,
  BytePlusSeedream5ImageProviderOptions,
  ParsedBytePlusImageSize,
} from './image/image-provider-options'
export type {
  BytePlusImageData,
  BytePlusImageErrorObject,
  BytePlusImageGenerationRequest,
  BytePlusImageGenerationResponse,
  BytePlusImageOutputFormat,
  BytePlusImageResponseFormat,
  BytePlusImageUsage,
  BytePlusOptimizePromptOptions,
  BytePlusSequentialImageGeneration,
  BytePlusSequentialImageGenerationOptions,
} from './image/wire-types'

// Adapters exported by later phases — append a block above this line.

export {
  BytePlusTextAdapter,
  byteplusText,
  createBytePlusText,
} from './adapters/text'
export type { BytePlusTextConfig } from './adapters/text'

export type {
  BytePlusAudioMetadata,
  BytePlusChatContentPart,
  BytePlusDocumentMetadata,
  BytePlusEncryptedContentFields,
  BytePlusImageMetadata,
  BytePlusImagePixelLimit,
  BytePlusImageUrlContentPart,
  BytePlusInputAudioContentPart,
  BytePlusMessageMetadataByModality,
  BytePlusStreamDeltaExtras,
  BytePlusTextMetadata,
  BytePlusVideoMetadata,
  BytePlusVideoUrlContentPart,
} from './message-types'

// ============================================================================
// Client configuration
// ============================================================================

export {
  BYTEPLUS_ARK_BASE_URL,
  BYTEPLUS_VOICE_BASE_URL,
  bytePlusArkError,
  bytePlusArkHeaders,
  bytePlusVoiceError,
  bytePlusVoiceHeaders,
  getBytePlusArkApiKeyFromEnv,
  getBytePlusVoiceApiKeyFromEnv,
  withBytePlusArkDefaults,
  withBytePlusVoiceDefaults,
} from './utils/client'
export type { BytePlusArkConfig, BytePlusVoiceConfig } from './utils/client'

// ============================================================================
// Provider options
// ============================================================================

export type {
  BytePlusNamedToolChoice,
  BytePlusReasoningEffort,
  BytePlusServiceTier,
  BytePlusTextProviderOptions,
  BytePlusThinkingOption,
  BytePlusToolChoice,
} from './text/text-provider-options'

// ============================================================================
// Model metadata
// ============================================================================

export {
  BYTEPLUS_CHAT_MODELS,
  BYTEPLUS_IMAGE_MAX_REFERENCE_IMAGES,
  BYTEPLUS_IMAGE_MODELS,
  BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS,
  BYTEPLUS_THINKING_SUMMARY_MODELS,
  BYTEPLUS_TRANSCRIPTION_MODELS,
  BYTEPLUS_TTS_MODELS,
  BYTEPLUS_VIDEO_DURATIONS,
  BYTEPLUS_VIDEO_MODELS,
  emitsEncryptedContent,
  getBytePlusVideoDurationOptions,
  supportsStructuredOutput,
} from './model-meta'
export type {
  BytePlusChatModel,
  BytePlusChatModelProviderOptionsByName,
  BytePlusChatModelStructuredOutputByName,
  BytePlusChatModelToolCapabilitiesByName,
  BytePlusImageModel,
  BytePlusImageModelSizeByName,
  BytePlusImageSize,
  BytePlusImageSizeToken,
  BytePlusModelInputModalitiesByName,
  BytePlusProviderToolKind,
  BytePlusStructuredOutputChatModel,
  BytePlusThinkingSummaryModel,
  BytePlusTranscriptionModel,
  BytePlusTTSModel,
  BytePlusVideoModel,
  BytePlusVideoModelDurationByName,
  BytePlusVideoModelInputModalitiesByName,
  BytePlusVideoModelResolutionByName,
  BytePlusVideoModelSizeByName,
  BytePlusVideoRatio,
  BytePlusVideoResolution,
  BytePlusVideoSize,
  ResolveInputModalities,
  ResolveProviderOptions,
} from './model-meta'
