// ============================================================================
// Image Adapter
// ============================================================================

export { FalImageAdapter, createFalImage, falImage } from './adapters/image'

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
} from './model-meta'

export {
  type FalImageInput,
  type FalImageOutput,
  type FalVideoInput,
  type FalVideoOutput,
  type FalImageModel,
  type FalVideoModel,
  type FalAudioModel,
  type FalTextModel,
  type Fal3dModel,
  type FalJsonModel,
  type FalAudioInput,
  type FalAudioOutput,
  type FalTextInput,
  type FalTextOutput,
  type Fal3dInput,
  type Fal3dOutput,
  type FalJsonInput,
  type FalJsonOutput,
} from './generated'
// ============================================================================
// Utils
// ============================================================================

export {
  getFalApiKeyFromEnv,
  configureFalClient,
  generateId,
  type FalClientConfig,
} from './utils'
