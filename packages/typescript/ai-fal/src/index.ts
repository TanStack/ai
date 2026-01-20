// ============================================================================
// Image Adapter
// ============================================================================

export {
  FalImageAdapter,
  createFalImage,
  falImage,
  type FalImageConfig,
} from './adapters/image'

export {
  mapSizeToFalFormat,
  type FalImageSizePreset,
} from './image/image-provider-options'

// ============================================================================
// Video Adapter (Experimental)
// ============================================================================

export {
  FalVideoAdapter,
  createFalVideo,
  falVideo,
  type FalVideoConfig,
} from './adapters/video'

// ============================================================================
// Model Types (from fal.ai's type system)
// ============================================================================

export {
  type EndpointTypeMap,
  type FalModel,
  type FalModelInput,
  type FalModelOutput,
  type FalImageProviderOptions,
  type FalVideoProviderOptions,
} from './model-meta'

// ============================================================================
// Utils
// ============================================================================

export {
  getFalApiKeyFromEnv,
  configureFalClient,
  generateId,
  type FalClientConfig,
} from './utils'
