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
// Adapters exported by later phases — append a block above this line.

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
  BytePlusReasoningEffort,
  BytePlusServiceTier,
  BytePlusTextProviderOptions,
  BytePlusThinkingOption,
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
