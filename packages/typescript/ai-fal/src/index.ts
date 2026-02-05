// ============================================================================
// Image Adapter
// ============================================================================

export { FalImageAdapter, createFalImage } from './adapters/image'

export {
  mapSizeToFalFormat,
  type FalImageSizePreset,
} from './image/image-provider-options'

// ============================================================================
// Video Adapter (Experimental)
// ============================================================================

export { FalVideoAdapter, createFalVideo, falVideo } from './adapters/video'

// ============================================================================
// Model Types (from fal.ai's type system)
// ============================================================================

export {
  type FalImageProviderOptions,
  type FalVideoProviderOptions,
  type FalModel,
  type FalModelInput,
  type FalModelOutput,
  type FalModelImageSize,
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
