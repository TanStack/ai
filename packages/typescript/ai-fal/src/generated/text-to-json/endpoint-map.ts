// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaFiboGenerateStructuredPromptInput,
  zSchemaFiboGenerateStructuredPromptOutput,
} from './zod.gen'

import type {
  SchemaFiboGenerateStructuredPromptInput,
  SchemaFiboGenerateStructuredPromptOutput,
} from './types.gen'

export type TextToJsonEndpointMap = {
  'bria/fibo/generate/structured_prompt': {
    input: SchemaFiboGenerateStructuredPromptInput
    output: SchemaFiboGenerateStructuredPromptOutput
  }
}

export const TextToJsonSchemaMap = {
  ['bria/fibo/generate/structured_prompt']: {
    input: zSchemaFiboGenerateStructuredPromptInput,
    output: zSchemaFiboGenerateStructuredPromptOutput,
  },
} as const

/** Union type of all text-to-json model endpoint IDs */
export type TextToJsonModel = keyof TextToJsonEndpointMap

/** Get the input type for a specific text-to-json model */
export type TextToJsonModelInput<T extends TextToJsonModel> = TextToJsonEndpointMap[T]['input']

/** Get the output type for a specific text-to-json model */
export type TextToJsonModelOutput<T extends TextToJsonModel> = TextToJsonEndpointMap[T]['output']
