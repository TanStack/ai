// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zAiDetectorDetectTextInput,
  zAiDetectorDetectTextOutput,
} from './zod.gen'

import type {
  AiDetectorDetectTextInput,
  AiDetectorDetectTextOutput,
} from './types.gen'

import type { z } from 'zod'

export type TextToTextEndpointMap = {
  'half-moon-ai/ai-detector/detect-text': {
    input: AiDetectorDetectTextInput
    output: AiDetectorDetectTextOutput
  }
}

/** Union type of all text-to-text model endpoint IDs */
export type TextToTextModel = keyof TextToTextEndpointMap

export const TextToTextSchemaMap: Record<
  TextToTextModel,
  { input: z.ZodSchema; output: z.ZodSchema }
> = {
  ['half-moon-ai/ai-detector/detect-text']: {
    input: zAiDetectorDetectTextInput,
    output: zAiDetectorDetectTextOutput,
  },
} as const

/** Get the input type for a specific text-to-text model */
export type TextToTextModelInput<T extends TextToTextModel> =
  TextToTextEndpointMap[T]['input']

/** Get the output type for a specific text-to-text model */
export type TextToTextModelOutput<T extends TextToTextModel> =
  TextToTextEndpointMap[T]['output']
