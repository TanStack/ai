// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

// Import value exports (SchemaMap constants) from category endpoint maps
import { Gen3dTo3dSchemaMap } from './3d-to-3d/endpoint-map'
import { AudioToAudioSchemaMap } from './audio-to-audio/endpoint-map'
import { AudioToTextSchemaMap } from './audio-to-text/endpoint-map'
import { AudioToVideoSchemaMap } from './audio-to-video/endpoint-map'
import { ImageTo3dSchemaMap } from './image-to-3d/endpoint-map'
import { ImageToImageSchemaMap } from './image-to-image/endpoint-map'
import { ImageToJsonSchemaMap } from './image-to-json/endpoint-map'
import { ImageToVideoSchemaMap } from './image-to-video/endpoint-map'
import { JsonSchemaMap } from './json/endpoint-map'
import { SpeechToSpeechSchemaMap } from './speech-to-speech/endpoint-map'
import { SpeechToTextSchemaMap } from './speech-to-text/endpoint-map'
import { TextTo3dSchemaMap } from './text-to-3d/endpoint-map'
import { TextToAudioSchemaMap } from './text-to-audio/endpoint-map'
import { TextToImageSchemaMap } from './text-to-image/endpoint-map'
import { TextToJsonSchemaMap } from './text-to-json/endpoint-map'
import { TextToSpeechSchemaMap } from './text-to-speech/endpoint-map'
import { TextToTextSchemaMap } from './text-to-text/endpoint-map'
import { TextToVideoSchemaMap } from './text-to-video/endpoint-map'
import { VideoToTextSchemaMap } from './video-to-text/endpoint-map'
import { VideoToVideoSchemaMap } from './video-to-video/endpoint-map'
import { VisionSchemaMap } from './vision/endpoint-map'

// Import type exports from category endpoint maps
import type {
  Gen3dTo3dModel,
  Gen3dTo3dModelInput,
  Gen3dTo3dModelOutput,
} from './3d-to-3d/endpoint-map'
import type {
  AudioToAudioModel,
  AudioToAudioModelInput,
  AudioToAudioModelOutput,
} from './audio-to-audio/endpoint-map'
import type {
  AudioToTextModel,
  AudioToTextModelInput,
  AudioToTextModelOutput,
} from './audio-to-text/endpoint-map'
import type {
  AudioToVideoModel,
  AudioToVideoModelInput,
  AudioToVideoModelOutput,
} from './audio-to-video/endpoint-map'
import type {
  ImageTo3dModel,
  ImageTo3dModelInput,
  ImageTo3dModelOutput,
} from './image-to-3d/endpoint-map'
import type {
  ImageToImageModel,
  ImageToImageModelInput,
  ImageToImageModelOutput,
} from './image-to-image/endpoint-map'
import type {
  ImageToJsonModel,
  ImageToJsonModelInput,
  ImageToJsonModelOutput,
} from './image-to-json/endpoint-map'
import type {
  ImageToVideoModel,
  ImageToVideoModelInput,
  ImageToVideoModelOutput,
} from './image-to-video/endpoint-map'
import type {
  JsonModel,
  JsonModelInput,
  JsonModelOutput,
} from './json/endpoint-map'
import type { LlmModel } from './llm/endpoint-map'
import type {
  SpeechToSpeechModel,
  SpeechToSpeechModelInput,
  SpeechToSpeechModelOutput,
} from './speech-to-speech/endpoint-map'
import type {
  SpeechToTextModel,
  SpeechToTextModelInput,
  SpeechToTextModelOutput,
} from './speech-to-text/endpoint-map'
import type {
  TextTo3dModel,
  TextTo3dModelInput,
  TextTo3dModelOutput,
} from './text-to-3d/endpoint-map'
import type {
  TextToAudioModel,
  TextToAudioModelInput,
  TextToAudioModelOutput,
} from './text-to-audio/endpoint-map'
import type {
  TextToImageModel,
  TextToImageModelInput,
  TextToImageModelOutput,
} from './text-to-image/endpoint-map'
import type {
  TextToJsonModel,
  TextToJsonModelInput,
  TextToJsonModelOutput,
} from './text-to-json/endpoint-map'
import type {
  TextToSpeechModel,
  TextToSpeechModelInput,
  TextToSpeechModelOutput,
} from './text-to-speech/endpoint-map'
import type {
  TextToTextModel,
  TextToTextModelInput,
  TextToTextModelOutput,
} from './text-to-text/endpoint-map'
import type {
  TextToVideoModel,
  TextToVideoModelInput,
  TextToVideoModelOutput,
} from './text-to-video/endpoint-map'
import type { TrainingModel } from './training/endpoint-map'
import type { UnknownModel } from './unknown/endpoint-map'
import type { VideoToAudioModel } from './video-to-audio/endpoint-map'
import type {
  VideoToTextModel,
  VideoToTextModelInput,
  VideoToTextModelOutput,
} from './video-to-text/endpoint-map'
import type {
  VideoToVideoModel,
  VideoToVideoModelInput,
  VideoToVideoModelOutput,
} from './video-to-video/endpoint-map'
import type {
  VisionModel,
  VisionModelInput,
  VisionModelOutput,
} from './vision/endpoint-map'

import type { z } from 'zod'

// Import official fal.ai endpoint types
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'

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
  | AudioToAudioModel
  | AudioToTextModel
  | AudioToVideoModel
  | Gen3dTo3dModel
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
export type FalImageModel = TextToImageModel | ImageToImageModel

/**
 * Get the input type for a specific image model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalImageInput<T extends FalImageModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends TextToImageModel
      ? TextToImageModelInput<T>
      : T extends ImageToImageModel
        ? ImageToImageModelInput<T>
        : never

/**
 * Get the output type for a specific image model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalImageOutput<T extends FalImageModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends TextToImageModel
      ? TextToImageModelOutput<T>
      : T extends ImageToImageModel
        ? ImageToImageModelOutput<T>
        : never

/** Combined schema map for all image models */
export const FalImageSchemaMap: Record<
  FalImageModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ...TextToImageSchemaMap,
  ...ImageToImageSchemaMap,
} as const

/** Union of all video generation models */
export type FalVideoModel =
  | TextToVideoModel
  | ImageToVideoModel
  | VideoToVideoModel
  | AudioToVideoModel

/**
 * Get the input type for a specific video model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalVideoInput<T extends FalVideoModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends TextToVideoModel
      ? TextToVideoModelInput<T>
      : T extends ImageToVideoModel
        ? ImageToVideoModelInput<T>
        : T extends VideoToVideoModel
          ? VideoToVideoModelInput<T>
          : T extends AudioToVideoModel
            ? AudioToVideoModelInput<T>
            : never

/**
 * Get the output type for a specific video model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalVideoOutput<T extends FalVideoModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends TextToVideoModel
      ? TextToVideoModelOutput<T>
      : T extends ImageToVideoModel
        ? ImageToVideoModelOutput<T>
        : T extends VideoToVideoModel
          ? VideoToVideoModelOutput<T>
          : T extends AudioToVideoModel
            ? AudioToVideoModelOutput<T>
            : never

/** Combined schema map for all video models */
export const FalVideoSchemaMap: Record<
  FalVideoModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
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

/**
 * Get the input type for a specific audio model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalAudioInput<T extends FalAudioModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends TextToAudioModel
      ? TextToAudioModelInput<T>
      : T extends AudioToAudioModel
        ? AudioToAudioModelInput<T>
        : T extends SpeechToSpeechModel
          ? SpeechToSpeechModelInput<T>
          : T extends TextToSpeechModel
            ? TextToSpeechModelInput<T>
            : never

/**
 * Get the output type for a specific audio model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalAudioOutput<T extends FalAudioModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends TextToAudioModel
      ? TextToAudioModelOutput<T>
      : T extends AudioToAudioModel
        ? AudioToAudioModelOutput<T>
        : T extends SpeechToSpeechModel
          ? SpeechToSpeechModelOutput<T>
          : T extends TextToSpeechModel
            ? TextToSpeechModelOutput<T>
            : never

/** Combined schema map for all audio models */
export const FalAudioSchemaMap: Record<
  FalAudioModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
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

/**
 * Get the input type for a specific text model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalTextInput<T extends FalTextModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends TextToTextModel
      ? TextToTextModelInput<T>
      : T extends AudioToTextModel
        ? AudioToTextModelInput<T>
        : T extends VideoToTextModel
          ? VideoToTextModelInput<T>
          : T extends VisionModel
            ? VisionModelInput<T>
            : T extends SpeechToTextModel
              ? SpeechToTextModelInput<T>
              : never

/**
 * Get the output type for a specific text model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalTextOutput<T extends FalTextModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends TextToTextModel
      ? TextToTextModelOutput<T>
      : T extends AudioToTextModel
        ? AudioToTextModelOutput<T>
        : T extends VideoToTextModel
          ? VideoToTextModelOutput<T>
          : T extends VisionModel
            ? VisionModelOutput<T>
            : T extends SpeechToTextModel
              ? SpeechToTextModelOutput<T>
              : never

/** Combined schema map for all text models */
export const FalTextSchemaMap: Record<
  FalTextModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ...TextToTextSchemaMap,
  ...AudioToTextSchemaMap,
  ...VideoToTextSchemaMap,
  ...VisionSchemaMap,
  ...SpeechToTextSchemaMap,
} as const

/** Union of all 3d generation models */
export type Fal3dModel = TextTo3dModel | ImageTo3dModel | Gen3dTo3dModel

/**
 * Get the input type for a specific 3d model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type Fal3dInput<T extends Fal3dModel> = T extends keyof EndpointTypeMap
  ? EndpointTypeMap[T]['input']
  : T extends TextTo3dModel
    ? TextTo3dModelInput<T>
    : T extends ImageTo3dModel
      ? ImageTo3dModelInput<T>
      : T extends Gen3dTo3dModel
        ? Gen3dTo3dModelInput<T>
        : never

/**
 * Get the output type for a specific 3d model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type Fal3dOutput<T extends Fal3dModel> = T extends keyof EndpointTypeMap
  ? EndpointTypeMap[T]['output']
  : T extends TextTo3dModel
    ? TextTo3dModelOutput<T>
    : T extends ImageTo3dModel
      ? ImageTo3dModelOutput<T>
      : T extends Gen3dTo3dModel
        ? Gen3dTo3dModelOutput<T>
        : never

/** Combined schema map for all 3d models */
export const Fal3dSchemaMap: Record<
  Fal3dModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ...TextTo3dSchemaMap,
  ...ImageTo3dSchemaMap,
  ...Gen3dTo3dSchemaMap,
} as const

/** Union of all json generation models */
export type FalJsonModel = TextToJsonModel | ImageToJsonModel | JsonModel

/**
 * Get the input type for a specific json model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalJsonInput<T extends FalJsonModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends TextToJsonModel
      ? TextToJsonModelInput<T>
      : T extends ImageToJsonModel
        ? ImageToJsonModelInput<T>
        : T extends JsonModel
          ? JsonModelInput<T>
          : never

/**
 * Get the output type for a specific json model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalJsonOutput<T extends FalJsonModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends TextToJsonModel
      ? TextToJsonModelOutput<T>
      : T extends ImageToJsonModel
        ? ImageToJsonModelOutput<T>
        : T extends JsonModel
          ? JsonModelOutput<T>
          : never

/** Combined schema map for all json models */
export const FalJsonSchemaMap: Record<
  FalJsonModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ...TextToJsonSchemaMap,
  ...ImageToJsonSchemaMap,
  ...JsonSchemaMap,
} as const
