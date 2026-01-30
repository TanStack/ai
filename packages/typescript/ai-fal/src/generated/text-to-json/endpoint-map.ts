// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zSchemaFiboEditEditStructuredInstructionInput,
  zSchemaFiboEditEditStructuredInstructionOutput,
  zSchemaFiboGenerateStructuredPromptInput,
  zSchemaFiboGenerateStructuredPromptOutput,
  zSchemaFiboLiteGenerateStructuredPromptInput,
  zSchemaFiboLiteGenerateStructuredPromptLiteInput,
  zSchemaFiboLiteGenerateStructuredPromptLiteOutput,
  zSchemaFiboLiteGenerateStructuredPromptOutput,
} from './zod.gen'

import type {
  SchemaFiboEditEditStructuredInstructionInput,
  SchemaFiboEditEditStructuredInstructionOutput,
  SchemaFiboGenerateStructuredPromptInput,
  SchemaFiboGenerateStructuredPromptOutput,
  SchemaFiboLiteGenerateStructuredPromptInput,
  SchemaFiboLiteGenerateStructuredPromptLiteInput,
  SchemaFiboLiteGenerateStructuredPromptLiteOutput,
  SchemaFiboLiteGenerateStructuredPromptOutput,
} from './types.gen'

import type { z } from 'zod'

export type TextToJsonEndpointMap = {
  'bria/fibo-edit/edit/structured_instruction': {
    input: SchemaFiboEditEditStructuredInstructionInput
    output: SchemaFiboEditEditStructuredInstructionOutput
  }
  'bria/fibo-lite/generate/structured_prompt': {
    input: SchemaFiboLiteGenerateStructuredPromptInput
    output: SchemaFiboLiteGenerateStructuredPromptOutput
  }
  'bria/fibo-lite/generate/structured_prompt/lite': {
    input: SchemaFiboLiteGenerateStructuredPromptLiteInput
    output: SchemaFiboLiteGenerateStructuredPromptLiteOutput
  }
  'bria/fibo/generate/structured_prompt': {
    input: SchemaFiboGenerateStructuredPromptInput
    output: SchemaFiboGenerateStructuredPromptOutput
  }
}

/** Union type of all text-to-json model endpoint IDs */
export type TextToJsonModel = keyof TextToJsonEndpointMap

export const TextToJsonSchemaMap: Record<
  TextToJsonModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['bria/fibo-edit/edit/structured_instruction']: {
    input: zSchemaFiboEditEditStructuredInstructionInput,
    output: zSchemaFiboEditEditStructuredInstructionOutput,
  },
  ['bria/fibo-lite/generate/structured_prompt']: {
    input: zSchemaFiboLiteGenerateStructuredPromptInput,
    output: zSchemaFiboLiteGenerateStructuredPromptOutput,
  },
  ['bria/fibo-lite/generate/structured_prompt/lite']: {
    input: zSchemaFiboLiteGenerateStructuredPromptLiteInput,
    output: zSchemaFiboLiteGenerateStructuredPromptLiteOutput,
  },
  ['bria/fibo/generate/structured_prompt']: {
    input: zSchemaFiboGenerateStructuredPromptInput,
    output: zSchemaFiboGenerateStructuredPromptOutput,
  },
} as const

/** Get the input type for a specific text-to-json model */
export type TextToJsonModelInput<T extends TextToJsonModel> =
  TextToJsonEndpointMap[T]['input']

/** Get the output type for a specific text-to-json model */
export type TextToJsonModelOutput<T extends TextToJsonModel> =
  TextToJsonEndpointMap[T]['output']
