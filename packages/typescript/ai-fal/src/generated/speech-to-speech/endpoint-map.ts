// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaChatterboxSpeechToSpeechInput,
  zSchemaChatterboxSpeechToSpeechOutput,
} from './zod.gen'

import type {
  SchemaChatterboxSpeechToSpeechInput,
  SchemaChatterboxSpeechToSpeechOutput,
} from './types.gen'

export type SpeechToSpeechEndpointMap = {
  'fal-ai/chatterbox/speech-to-speech': {
    input: SchemaChatterboxSpeechToSpeechInput
    output: SchemaChatterboxSpeechToSpeechOutput
  }
}

export const SpeechToSpeechSchemaMap = {
  ['fal-ai/chatterbox/speech-to-speech']: {
    input: zSchemaChatterboxSpeechToSpeechInput,
    output: zSchemaChatterboxSpeechToSpeechOutput,
  },
} as const

/** Union type of all speech-to-speech model endpoint IDs */
export type SpeechToSpeechModel = keyof SpeechToSpeechEndpointMap

/** Get the input type for a specific speech-to-speech model */
export type SpeechToSpeechModelInput<T extends SpeechToSpeechModel> = SpeechToSpeechEndpointMap[T]['input']

/** Get the output type for a specific speech-to-speech model */
export type SpeechToSpeechModelOutput<T extends SpeechToSpeechModel> = SpeechToSpeechEndpointMap[T]['output']
