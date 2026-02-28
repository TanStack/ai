// ============================================================================
// Image Adapter
// ============================================================================

export { FalImageAdapter, falImage } from './adapters/image'

// ============================================================================
// Video Adapter (Experimental)
// ============================================================================

export { FalVideoAdapter, falVideo } from './adapters/video'

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
  type FalModelVideoSize,
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
