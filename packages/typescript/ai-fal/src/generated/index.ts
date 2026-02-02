// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

// Import value exports (SchemaMap constants) from category endpoint maps
import { Gen3dSchemaMap } from './3d/endpoint-map'
import { AudioSchemaMap } from './audio/endpoint-map'
import { ImageSchemaMap } from './image/endpoint-map'
import { JsonSchemaMap } from './json/endpoint-map'
import { SpeechSchemaMap } from './speech/endpoint-map'
import { TextSchemaMap } from './text/endpoint-map'
import { VideoSchemaMap } from './video/endpoint-map'
import { VisionSchemaMap } from './vision/endpoint-map'

// Import type exports from category endpoint maps
import type {
  Gen3dModel,
  Gen3dModelInput,
  Gen3dModelOutput,
} from './3d/endpoint-map'
import type {
  AudioModel,
  AudioModelInput,
  AudioModelOutput,
} from './audio/endpoint-map'
import type {
  ImageModel,
  ImageModelInput,
  ImageModelOutput,
} from './image/endpoint-map'
import type {
  JsonModel,
  JsonModelInput,
  JsonModelOutput,
} from './json/endpoint-map'
import type { LlmModel } from './llm/endpoint-map'
import type {
  SpeechModel,
  SpeechModelInput,
  SpeechModelOutput,
} from './speech/endpoint-map'
import type {
  TextModel,
  TextModelInput,
  TextModelOutput,
} from './text/endpoint-map'
import type { TrainingModel } from './training/endpoint-map'
import type { UnknownModel } from './unknown/endpoint-map'
import type {
  VideoModel,
  VideoModelInput,
  VideoModelOutput,
} from './video/endpoint-map'
import type {
  VisionModel,
  VisionModelInput,
  VisionModelOutput,
} from './vision/endpoint-map'

import type { z } from 'zod'

// Import official fal.ai endpoint types
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'

// Re-export all category endpoint maps
export * from './3d/endpoint-map'
export * from './audio/endpoint-map'
export * from './image/endpoint-map'
export * from './json/endpoint-map'
export * from './llm/endpoint-map'
export * from './speech/endpoint-map'
export * from './text/endpoint-map'
export * from './training/endpoint-map'
export * from './unknown/endpoint-map'
export * from './video/endpoint-map'
export * from './vision/endpoint-map'

/**
 * Union type of all Fal.ai model endpoint IDs across all categories.
 *
 * Note: Using this union type loses some type precision. For better type safety,
 * import category-specific types like ImageToImageModel, TextToImageModel, etc.
 */
export type FalModel =
  | AudioModel
  | Gen3dModel
  | ImageModel
  | JsonModel
  | LlmModel
  | SpeechModel
  | TextModel
  | TrainingModel
  | UnknownModel
  | VideoModel
  | VisionModel

/** Union of all image generation models */
export type FalImageModel = ImageModel

/**
 * Get the input type for a specific image model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalImageInput<T extends FalImageModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends ImageModel
      ? ImageModelInput<T>
      : never

/**
 * Get the output type for a specific image model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalImageOutput<T extends FalImageModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends ImageModel
      ? ImageModelOutput<T>
      : never

function isImageModel(model: string): model is ImageModel {
  return model in ImageSchemaMap
}

/** Get schema for a image model. Overloads dispatch to category-specific maps. */
export function getFalImageSchema<T extends ImageModel>(
  model: T,
): (typeof ImageSchemaMap)[T]
export function getFalImageSchema(model: FalImageModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFalImageSchema(model: FalImageModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isImageModel(model)) {
    return ImageSchemaMap[model]
  }
  throw new Error(`Unknown image model: ${model}`)
}

/** Union of all video generation models */
export type FalVideoModel = VideoModel

/**
 * Get the input type for a specific video model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalVideoInput<T extends FalVideoModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends VideoModel
      ? VideoModelInput<T>
      : never

/**
 * Get the output type for a specific video model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalVideoOutput<T extends FalVideoModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends VideoModel
      ? VideoModelOutput<T>
      : never

function isVideoModel(model: string): model is VideoModel {
  return model in VideoSchemaMap
}

/** Get schema for a video model. Overloads dispatch to category-specific maps. */
export function getFalVideoSchema<T extends VideoModel>(
  model: T,
): (typeof VideoSchemaMap)[T]
export function getFalVideoSchema(model: FalVideoModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFalVideoSchema(model: FalVideoModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isVideoModel(model)) {
    return VideoSchemaMap[model]
  }
  throw new Error(`Unknown video model: ${model}`)
}

/** Union of all audio generation models */
export type FalAudioModel = AudioModel

/**
 * Get the input type for a specific audio model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalAudioInput<T extends FalAudioModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends AudioModel
      ? AudioModelInput<T>
      : never

/**
 * Get the output type for a specific audio model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalAudioOutput<T extends FalAudioModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends AudioModel
      ? AudioModelOutput<T>
      : never

function isAudioModel(model: string): model is AudioModel {
  return model in AudioSchemaMap
}

/** Get schema for a audio model. Overloads dispatch to category-specific maps. */
export function getFalAudioSchema<T extends AudioModel>(
  model: T,
): (typeof AudioSchemaMap)[T]
export function getFalAudioSchema(model: FalAudioModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFalAudioSchema(model: FalAudioModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isAudioModel(model)) {
    return AudioSchemaMap[model]
  }
  throw new Error(`Unknown audio model: ${model}`)
}

/** Union of all speech generation models */
export type FalSpeechModel = SpeechModel

/**
 * Get the input type for a specific speech model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalSpeechInput<T extends FalSpeechModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends SpeechModel
      ? SpeechModelInput<T>
      : never

/**
 * Get the output type for a specific speech model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalSpeechOutput<T extends FalSpeechModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends SpeechModel
      ? SpeechModelOutput<T>
      : never

function isSpeechModel(model: string): model is SpeechModel {
  return model in SpeechSchemaMap
}

/** Get schema for a speech model. Overloads dispatch to category-specific maps. */
export function getFalSpeechSchema<T extends SpeechModel>(
  model: T,
): (typeof SpeechSchemaMap)[T]
export function getFalSpeechSchema(model: FalSpeechModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFalSpeechSchema(model: FalSpeechModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isSpeechModel(model)) {
    return SpeechSchemaMap[model]
  }
  throw new Error(`Unknown speech model: ${model}`)
}

/** Union of all text generation models */
export type FalTextModel = TextModel | VisionModel

/**
 * Get the input type for a specific text model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalTextInput<T extends FalTextModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
    : T extends TextModel
      ? TextModelInput<T>
      : T extends VisionModel
        ? VisionModelInput<T>
        : never

/**
 * Get the output type for a specific text model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalTextOutput<T extends FalTextModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['output']
    : T extends TextModel
      ? TextModelOutput<T>
      : T extends VisionModel
        ? VisionModelOutput<T>
        : never

function isTextModel(model: string): model is TextModel {
  return model in TextSchemaMap
}

function isVisionModel(model: string): model is VisionModel {
  return model in VisionSchemaMap
}

/** Get schema for a text model. Overloads dispatch to category-specific maps. */
export function getFalTextSchema<T extends TextModel>(
  model: T,
): (typeof TextSchemaMap)[T]
export function getFalTextSchema<T extends VisionModel>(
  model: T,
): (typeof VisionSchemaMap)[T]
export function getFalTextSchema(model: FalTextModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFalTextSchema(model: FalTextModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isTextModel(model)) {
    return TextSchemaMap[model]
  }
  if (isVisionModel(model)) {
    return VisionSchemaMap[model]
  }
  throw new Error(`Unknown text model: ${model}`)
}

/** Union of all 3d generation models */
export type Fal3dModel = Gen3dModel

/**
 * Get the input type for a specific 3d model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type Fal3dInput<T extends Fal3dModel> = T extends keyof EndpointTypeMap
  ? EndpointTypeMap[T]['input']
  : T extends Gen3dModel
    ? Gen3dModelInput<T>
    : never

/**
 * Get the output type for a specific 3d model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type Fal3dOutput<T extends Fal3dModel> = T extends keyof EndpointTypeMap
  ? EndpointTypeMap[T]['output']
  : T extends Gen3dModel
    ? Gen3dModelOutput<T>
    : never

function isGen3dModel(model: string): model is Gen3dModel {
  return model in Gen3dSchemaMap
}

/** Get schema for a 3d model. Overloads dispatch to category-specific maps. */
export function getFal3dSchema<T extends Gen3dModel>(
  model: T,
): (typeof Gen3dSchemaMap)[T]
export function getFal3dSchema(model: Fal3dModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFal3dSchema(model: Fal3dModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isGen3dModel(model)) {
    return Gen3dSchemaMap[model]
  }
  throw new Error(`Unknown 3d model: ${model}`)
}

/** Union of all json generation models */
export type FalJsonModel = JsonModel

/**
 * Get the input type for a specific json model.
 * Checks official fal.ai EndpointTypeMap first, then falls back to category-specific types.
 */
export type FalJsonInput<T extends FalJsonModel> =
  T extends keyof EndpointTypeMap
    ? EndpointTypeMap[T]['input']
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
    : T extends JsonModel
      ? JsonModelOutput<T>
      : never

function isJsonModel(model: string): model is JsonModel {
  return model in JsonSchemaMap
}

/** Get schema for a json model. Overloads dispatch to category-specific maps. */
export function getFalJsonSchema<T extends JsonModel>(
  model: T,
): (typeof JsonSchemaMap)[T]
export function getFalJsonSchema(model: FalJsonModel): {
  input: z.ZodSchema
  output: z.ZodSchema
}
export function getFalJsonSchema(model: FalJsonModel): {
  input: z.ZodSchema
  output: z.ZodSchema
} {
  if (isJsonModel(model)) {
    return JsonSchemaMap[model]
  }
  throw new Error(`Unknown json model: ${model}`)
}
