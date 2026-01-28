// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

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

// Import all category model types for FalModel union
import type {
  Gen3dTo3dModel,
  AudioToAudioModel,
  AudioToTextModel,
  AudioToVideoModel,
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

// Import types and schemas for output-type unions
import type {
  Gen3dTo3dModelInput,
  Gen3dTo3dModelOutput,
  AudioToAudioModelInput,
  AudioToAudioModelOutput,
  AudioToTextModelInput,
  AudioToTextModelOutput,
  AudioToVideoModelInput,
  AudioToVideoModelOutput,
  ImageTo3dModelInput,
  ImageTo3dModelOutput,
  ImageToImageModelInput,
  ImageToImageModelOutput,
  ImageToJsonModelInput,
  ImageToJsonModelOutput,
  ImageToVideoModelInput,
  ImageToVideoModelOutput,
  JsonModelInput,
  JsonModelOutput,
  SpeechToSpeechModelInput,
  SpeechToSpeechModelOutput,
  SpeechToTextModelInput,
  SpeechToTextModelOutput,
  TextTo3dModelInput,
  TextTo3dModelOutput,
  TextToAudioModelInput,
  TextToAudioModelOutput,
  TextToImageModelInput,
  TextToImageModelOutput,
  TextToJsonModelInput,
  TextToJsonModelOutput,
  TextToSpeechModelInput,
  TextToSpeechModelOutput,
  TextToTextModelInput,
  TextToTextModelOutput,
  TextToVideoModelInput,
  TextToVideoModelOutput,
  VideoToTextModelInput,
  VideoToTextModelOutput,
  VideoToVideoModelInput,
  VideoToVideoModelOutput,
  VisionModelInput,
  VisionModelOutput,
} from './index'

import {
  Gen3dTo3dSchemaMap,
  AudioToAudioSchemaMap,
  AudioToTextSchemaMap,
  AudioToVideoSchemaMap,
  ImageTo3dSchemaMap,
  ImageToImageSchemaMap,
  ImageToJsonSchemaMap,
  ImageToVideoSchemaMap,
  JsonSchemaMap,
  SpeechToSpeechSchemaMap,
  SpeechToTextSchemaMap,
  TextTo3dSchemaMap,
  TextToAudioSchemaMap,
  TextToImageSchemaMap,
  TextToJsonSchemaMap,
  TextToSpeechSchemaMap,
  TextToTextSchemaMap,
  TextToVideoSchemaMap,
  VideoToTextSchemaMap,
  VideoToVideoSchemaMap,
  VisionSchemaMap,
} from './index'

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

/** Union of all image generation models */
export type FalImageModel =
  | TextToImageModel
  | ImageToImageModel

/** Get the input type for a specific image model */
export type FalImageInput<T extends FalImageModel> =
  T extends TextToImageModel ? TextToImageModelInput<T> :
  T extends ImageToImageModel ? ImageToImageModelInput<T> :
  never

/** Get the output type for a specific image model */
export type FalImageOutput<T extends FalImageModel> =
  T extends TextToImageModel ? TextToImageModelOutput<T> :
  T extends ImageToImageModel ? ImageToImageModelOutput<T> :
  never

/** Combined schema map for all image models */
export const FalImageSchemaMap = {
  ...TextToImageSchemaMap,
  ...ImageToImageSchemaMap,
} as const

/** Union of all video generation models */
export type FalVideoModel =
  | TextToVideoModel
  | ImageToVideoModel
  | VideoToVideoModel
  | AudioToVideoModel

/** Get the input type for a specific video model */
export type FalVideoInput<T extends FalVideoModel> =
  T extends TextToVideoModel ? TextToVideoModelInput<T> :
  T extends ImageToVideoModel ? ImageToVideoModelInput<T> :
  T extends VideoToVideoModel ? VideoToVideoModelInput<T> :
  T extends AudioToVideoModel ? AudioToVideoModelInput<T> :
  never

/** Get the output type for a specific video model */
export type FalVideoOutput<T extends FalVideoModel> =
  T extends TextToVideoModel ? TextToVideoModelOutput<T> :
  T extends ImageToVideoModel ? ImageToVideoModelOutput<T> :
  T extends VideoToVideoModel ? VideoToVideoModelOutput<T> :
  T extends AudioToVideoModel ? AudioToVideoModelOutput<T> :
  never

/** Combined schema map for all video models */
export const FalVideoSchemaMap = {
  ...TextToVideoSchemaMap,
  ...ImageToVideoSchemaMap,
  ...VideoToVideoSchemaMap,
  ...AudioToVideoSchemaMap,
} as const

/** Union of all audio generation models */
export type FalAudioModel =
  | TextToAudioModel
  | AudioToAudioModel
  | SpeechToSpeechModel
  | TextToSpeechModel

/** Get the input type for a specific audio model */
export type FalAudioInput<T extends FalAudioModel> =
  T extends TextToAudioModel ? TextToAudioModelInput<T> :
  T extends AudioToAudioModel ? AudioToAudioModelInput<T> :
  T extends SpeechToSpeechModel ? SpeechToSpeechModelInput<T> :
  T extends TextToSpeechModel ? TextToSpeechModelInput<T> :
  never

/** Get the output type for a specific audio model */
export type FalAudioOutput<T extends FalAudioModel> =
  T extends TextToAudioModel ? TextToAudioModelOutput<T> :
  T extends AudioToAudioModel ? AudioToAudioModelOutput<T> :
  T extends SpeechToSpeechModel ? SpeechToSpeechModelOutput<T> :
  T extends TextToSpeechModel ? TextToSpeechModelOutput<T> :
  never

/** Combined schema map for all audio models */
export const FalAudioSchemaMap = {
  ...TextToAudioSchemaMap,
  ...AudioToAudioSchemaMap,
  ...SpeechToSpeechSchemaMap,
  ...TextToSpeechSchemaMap,
} as const

/** Union of all text generation models */
export type FalTextModel =
  | TextToTextModel
  | AudioToTextModel
  | VideoToTextModel
  | VisionModel
  | SpeechToTextModel

/** Get the input type for a specific text model */
export type FalTextInput<T extends FalTextModel> =
  T extends TextToTextModel ? TextToTextModelInput<T> :
  T extends AudioToTextModel ? AudioToTextModelInput<T> :
  T extends VideoToTextModel ? VideoToTextModelInput<T> :
  T extends VisionModel ? VisionModelInput<T> :
  T extends SpeechToTextModel ? SpeechToTextModelInput<T> :
  never

/** Get the output type for a specific text model */
export type FalTextOutput<T extends FalTextModel> =
  T extends TextToTextModel ? TextToTextModelOutput<T> :
  T extends AudioToTextModel ? AudioToTextModelOutput<T> :
  T extends VideoToTextModel ? VideoToTextModelOutput<T> :
  T extends VisionModel ? VisionModelOutput<T> :
  T extends SpeechToTextModel ? SpeechToTextModelOutput<T> :
  never

/** Combined schema map for all text models */
export const FalTextSchemaMap = {
  ...TextToTextSchemaMap,
  ...AudioToTextSchemaMap,
  ...VideoToTextSchemaMap,
  ...VisionSchemaMap,
  ...SpeechToTextSchemaMap,
} as const

/** Union of all 3d generation models */
export type Fal3dModel =
  | TextTo3dModel
  | ImageTo3dModel
  | Gen3dTo3dModel

/** Get the input type for a specific 3d model */
export type Fal3dInput<T extends Fal3dModel> =
  T extends TextTo3dModel ? TextTo3dModelInput<T> :
  T extends ImageTo3dModel ? ImageTo3dModelInput<T> :
  T extends Gen3dTo3dModel ? Gen3dTo3dModelInput<T> :
  never

/** Get the output type for a specific 3d model */
export type Fal3dOutput<T extends Fal3dModel> =
  T extends TextTo3dModel ? TextTo3dModelOutput<T> :
  T extends ImageTo3dModel ? ImageTo3dModelOutput<T> :
  T extends Gen3dTo3dModel ? Gen3dTo3dModelOutput<T> :
  never

/** Combined schema map for all 3d models */
export const Fal3dSchemaMap = {
  ...TextTo3dSchemaMap,
  ...ImageTo3dSchemaMap,
  ...Gen3dTo3dSchemaMap,
} as const

/** Union of all json generation models */
export type FalJsonModel =
  | TextToJsonModel
  | ImageToJsonModel
  | JsonModel

/** Get the input type for a specific json model */
export type FalJsonInput<T extends FalJsonModel> =
  T extends TextToJsonModel ? TextToJsonModelInput<T> :
  T extends ImageToJsonModel ? ImageToJsonModelInput<T> :
  T extends JsonModel ? JsonModelInput<T> :
  never

/** Get the output type for a specific json model */
export type FalJsonOutput<T extends FalJsonModel> =
  T extends TextToJsonModel ? TextToJsonModelOutput<T> :
  T extends ImageToJsonModel ? ImageToJsonModelOutput<T> :
  T extends JsonModel ? JsonModelOutput<T> :
  never

/** Combined schema map for all json models */
export const FalJsonSchemaMap = {
  ...TextToJsonSchemaMap,
  ...ImageToJsonSchemaMap,
  ...JsonSchemaMap,
} as const
