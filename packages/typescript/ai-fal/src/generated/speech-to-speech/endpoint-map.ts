// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaChatterboxSpeechToSpeechInput,
  zSchemaChatterboxSpeechToSpeechOutput,
  zSchemaChatterboxhdSpeechToSpeechInput,
  zSchemaChatterboxhdSpeechToSpeechOutput,
} from './zod.gen'

import type {
  SchemaChatterboxSpeechToSpeechInput,
  SchemaChatterboxSpeechToSpeechOutput,
  SchemaChatterboxhdSpeechToSpeechInput,
  SchemaChatterboxhdSpeechToSpeechOutput,
} from './types.gen'

import type { z } from 'zod'

export type SpeechToSpeechEndpointMap = {
  'resemble-ai/chatterboxhd/speech-to-speech': {
    input: SchemaChatterboxhdSpeechToSpeechInput
    output: SchemaChatterboxhdSpeechToSpeechOutput
  }
  'fal-ai/chatterbox/speech-to-speech': {
    input: SchemaChatterboxSpeechToSpeechInput
    output: SchemaChatterboxSpeechToSpeechOutput
  }
}

/** Union type of all speech-to-speech model endpoint IDs */
export type SpeechToSpeechModel = keyof SpeechToSpeechEndpointMap

export const SpeechToSpeechSchemaMap: Record<
  SpeechToSpeechModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['resemble-ai/chatterboxhd/speech-to-speech']: {
    input: zSchemaChatterboxhdSpeechToSpeechInput,
    output: zSchemaChatterboxhdSpeechToSpeechOutput,
  },
  ['fal-ai/chatterbox/speech-to-speech']: {
    input: zSchemaChatterboxSpeechToSpeechInput,
    output: zSchemaChatterboxSpeechToSpeechOutput,
  },
} as const

/** Get the input type for a specific speech-to-speech model */
export type SpeechToSpeechModelInput<T extends SpeechToSpeechModel> =
  SpeechToSpeechEndpointMap[T]['input']

/** Get the output type for a specific speech-to-speech model */
export type SpeechToSpeechModelOutput<T extends SpeechToSpeechModel> =
  SpeechToSpeechEndpointMap[T]['output']
