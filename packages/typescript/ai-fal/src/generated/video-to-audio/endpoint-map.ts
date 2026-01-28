// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaKlingVideoVideoToAudioInput,
  zSchemaKlingVideoVideoToAudioOutput,
  zSchemaSamAudioVisualSeparateInput,
  zSchemaSamAudioVisualSeparateOutput,
  zSchemaSfxV15VideoToAudioInput,
  zSchemaSfxV15VideoToAudioOutput,
  zSchemaSfxV1VideoToAudioInput,
  zSchemaSfxV1VideoToAudioOutput,
} from './zod.gen'

import type {
  SchemaKlingVideoVideoToAudioInput,
  SchemaKlingVideoVideoToAudioOutput,
  SchemaSamAudioVisualSeparateInput,
  SchemaSamAudioVisualSeparateOutput,
  SchemaSfxV15VideoToAudioInput,
  SchemaSfxV15VideoToAudioOutput,
  SchemaSfxV1VideoToAudioInput,
  SchemaSfxV1VideoToAudioOutput,
} from './types.gen'

export type VideoToAudioEndpointMap = {
  'fal-ai/sam-audio/visual-separate': {
    input: SchemaSamAudioVisualSeparateInput
    output: SchemaSamAudioVisualSeparateOutput
  }
  'mirelo-ai/sfx-v1.5/video-to-audio': {
    input: SchemaSfxV15VideoToAudioInput
    output: SchemaSfxV15VideoToAudioOutput
  }
  'fal-ai/kling-video/video-to-audio': {
    input: SchemaKlingVideoVideoToAudioInput
    output: SchemaKlingVideoVideoToAudioOutput
  }
  'mirelo-ai/sfx-v1/video-to-audio': {
    input: SchemaSfxV1VideoToAudioInput
    output: SchemaSfxV1VideoToAudioOutput
  }
}

export const VideoToAudioSchemaMap = {
  ['fal-ai/sam-audio/visual-separate']: {
    input: zSchemaSamAudioVisualSeparateInput,
    output: zSchemaSamAudioVisualSeparateOutput,
  },
  ['mirelo-ai/sfx-v1.5/video-to-audio']: {
    input: zSchemaSfxV15VideoToAudioInput,
    output: zSchemaSfxV15VideoToAudioOutput,
  },
  ['fal-ai/kling-video/video-to-audio']: {
    input: zSchemaKlingVideoVideoToAudioInput,
    output: zSchemaKlingVideoVideoToAudioOutput,
  },
  ['mirelo-ai/sfx-v1/video-to-audio']: {
    input: zSchemaSfxV1VideoToAudioInput,
    output: zSchemaSfxV1VideoToAudioOutput,
  },
} as const

/** Union type of all video-to-audio model endpoint IDs */
export type VideoToAudioModel = keyof VideoToAudioEndpointMap

/** Get the input type for a specific video-to-audio model */
export type VideoToAudioModelInput<T extends VideoToAudioModel> = VideoToAudioEndpointMap[T]['input']

/** Get the output type for a specific video-to-audio model */
export type VideoToAudioModelOutput<T extends VideoToAudioModel> = VideoToAudioEndpointMap[T]['output']
