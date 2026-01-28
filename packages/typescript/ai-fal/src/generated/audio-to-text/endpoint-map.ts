// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaNemotronAsrInput,
  zSchemaNemotronAsrOutput,
  zSchemaNemotronAsrStreamInput,
  zSchemaNemotronAsrStreamOutput,
  zSchemaSileroVadInput,
  zSchemaSileroVadOutput,
} from './zod.gen'

import type {
  SchemaNemotronAsrInput,
  SchemaNemotronAsrOutput,
  SchemaNemotronAsrStreamInput,
  SchemaNemotronAsrStreamOutput,
  SchemaSileroVadInput,
  SchemaSileroVadOutput,
} from './types.gen'

export type AudioToTextEndpointMap = {
  'fal-ai/nemotron/asr/stream': {
    input: SchemaNemotronAsrStreamInput
    output: SchemaNemotronAsrStreamOutput
  }
  'fal-ai/nemotron/asr': {
    input: SchemaNemotronAsrInput
    output: SchemaNemotronAsrOutput
  }
  'fal-ai/silero-vad': {
    input: SchemaSileroVadInput
    output: SchemaSileroVadOutput
  }
}

export const AudioToTextSchemaMap = {
  ['fal-ai/nemotron/asr/stream']: {
    input: zSchemaNemotronAsrStreamInput,
    output: zSchemaNemotronAsrStreamOutput,
  },
  ['fal-ai/nemotron/asr']: {
    input: zSchemaNemotronAsrInput,
    output: zSchemaNemotronAsrOutput,
  },
  ['fal-ai/silero-vad']: {
    input: zSchemaSileroVadInput,
    output: zSchemaSileroVadOutput,
  },
} as const

/** Union type of all audio-to-text model endpoint IDs */
export type AudioToTextModel = keyof AudioToTextEndpointMap

/** Get the input type for a specific audio-to-text model */
export type AudioToTextModelInput<T extends AudioToTextModel> = AudioToTextEndpointMap[T]['input']

/** Get the output type for a specific audio-to-text model */
export type AudioToTextModelOutput<T extends AudioToTextModel> = AudioToTextEndpointMap[T]['output']
