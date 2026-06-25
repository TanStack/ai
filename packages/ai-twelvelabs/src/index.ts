// ============================================================================
// Text (Pegasus video understanding) Adapter
// ============================================================================

export {
  TwelveLabsTextAdapter,
  createTwelveLabsText,
  twelvelabsText,
  type TwelveLabsTextConfig,
  type TwelveLabsTextProviderOptions,
} from './adapters/text'

// ============================================================================
// Model Metadata
// ============================================================================

export {
  TWELVELABS_CHAT_MODELS,
  TWELVELABS_EMBEDDING_MODELS,
  type TwelveLabsChatModel,
  type TwelveLabsEmbeddingModel,
  type TwelveLabsChatModelProviderOptionsByName,
  type TwelveLabsModelInputModalitiesByName,
} from './model-meta'

// ============================================================================
// Message Metadata Types
// ============================================================================

export type {
  TwelveLabsVideoMetadata,
  TwelveLabsVideoMimeType,
  TwelveLabsMessageMetadataByModality,
} from './message-types'

// ============================================================================
// Utilities
// ============================================================================

export {
  createTwelveLabsClient,
  getTwelveLabsApiKeyFromEnv,
  type TwelveLabsClientConfig,
} from './utils'
