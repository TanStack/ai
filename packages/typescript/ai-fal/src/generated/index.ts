// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

// Create a union type of all models across categories
import type {
  AudioToAudioModel,
  AudioToTextModel,
  AudioToVideoModel,
  Gen3dTo3dModel,
  ImageTo3dModel,
  ImageToImageModel,
  ImageToJsonModel,
  ImageToVideoModel,
  JsonModel,
  LlmModel,
  SpeechToSpeechModel,
  SpeechToTextModel,
  TextTo3dModel,
  TextToAudioModel,
  TextToImageModel,
  TextToJsonModel,
  TextToSpeechModel,
  TextToTextModel,
  TextToVideoModel,
  TrainingModel,
  UnknownModel,
  VideoToAudioModel,
  VideoToTextModel,
  VideoToVideoModel,
  VisionModel,
} from './index'

// Re-export all category endpoint maps
export * from './3d-to-3d/endpoint-map'
export * from './audio-to-audio/endpoint-map'
export * from './audio-to-text/endpoint-map'
export * from './audio-to-video/endpoint-map'
export * from './image-to-3d/endpoint-map'
export * from './image-to-image/endpoint-map'
export * from './image-to-json/endpoint-map'
export * from './image-to-video/endpoint-map'
export * from './json/endpoint-map'
export * from './llm/endpoint-map'
export * from './speech-to-speech/endpoint-map'
export * from './speech-to-text/endpoint-map'
export * from './text-to-3d/endpoint-map'
export * from './text-to-audio/endpoint-map'
export * from './text-to-image/endpoint-map'
export * from './text-to-json/endpoint-map'
export * from './text-to-speech/endpoint-map'
export * from './text-to-text/endpoint-map'
export * from './text-to-video/endpoint-map'
export * from './training/endpoint-map'
export * from './unknown/endpoint-map'
export * from './video-to-audio/endpoint-map'
export * from './video-to-text/endpoint-map'
export * from './video-to-video/endpoint-map'
export * from './vision/endpoint-map'

/**
 * Union type of all Fal.ai model endpoint IDs across all categories.
 *
 * Note: Using this union type loses some type precision. For better type safety,
 * import category-specific types like ImageToImageModel, TextToImageModel, etc.
 */
export type FalModel =
  | Gen3dTo3dModel
  | AudioToAudioModel
  | AudioToTextModel
  | AudioToVideoModel
  | ImageTo3dModel
  | ImageToImageModel
  | ImageToJsonModel
  | ImageToVideoModel
  | JsonModel
  | LlmModel
  | SpeechToSpeechModel
  | SpeechToTextModel
  | TextTo3dModel
  | TextToAudioModel
  | TextToImageModel
  | TextToJsonModel
  | TextToSpeechModel
  | TextToTextModel
  | TextToVideoModel
  | TrainingModel
  | UnknownModel
  | VideoToAudioModel
  | VideoToTextModel
  | VideoToVideoModel
  | VisionModel
