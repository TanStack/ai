// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaFfmpegApiLoudnormInput,
  zSchemaFfmpegApiLoudnormOutput,
  zSchemaFfmpegApiMetadataInput,
  zSchemaFfmpegApiMetadataOutput,
  zSchemaFfmpegApiWaveformInput,
  zSchemaFfmpegApiWaveformOutput,
} from './zod.gen'

import type {
  SchemaFfmpegApiLoudnormInput,
  SchemaFfmpegApiLoudnormOutput,
  SchemaFfmpegApiMetadataInput,
  SchemaFfmpegApiMetadataOutput,
  SchemaFfmpegApiWaveformInput,
  SchemaFfmpegApiWaveformOutput,
} from './types.gen'

export type JsonEndpointMap = {
  'fal-ai/ffmpeg-api/loudnorm': {
    input: SchemaFfmpegApiLoudnormInput
    output: SchemaFfmpegApiLoudnormOutput
  }
  'fal-ai/ffmpeg-api/waveform': {
    input: SchemaFfmpegApiWaveformInput
    output: SchemaFfmpegApiWaveformOutput
  }
  'fal-ai/ffmpeg-api/metadata': {
    input: SchemaFfmpegApiMetadataInput
    output: SchemaFfmpegApiMetadataOutput
  }
}

export const JsonSchemaMap = {
  ['fal-ai/ffmpeg-api/loudnorm']: {
    input: zSchemaFfmpegApiLoudnormInput,
    output: zSchemaFfmpegApiLoudnormOutput,
  },
  ['fal-ai/ffmpeg-api/waveform']: {
    input: zSchemaFfmpegApiWaveformInput,
    output: zSchemaFfmpegApiWaveformOutput,
  },
  ['fal-ai/ffmpeg-api/metadata']: {
    input: zSchemaFfmpegApiMetadataInput,
    output: zSchemaFfmpegApiMetadataOutput,
  },
} as const

/** Union type of all json model endpoint IDs */
export type JsonModel = keyof JsonEndpointMap

/** Get the input type for a specific json model */
export type JsonModelInput<T extends JsonModel> = JsonEndpointMap[T]['input']

/** Get the output type for a specific json model */
export type JsonModelOutput<T extends JsonModel> = JsonEndpointMap[T]['output']
