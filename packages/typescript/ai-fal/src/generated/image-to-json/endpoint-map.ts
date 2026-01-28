// AUTO-GENERATED - Do not edit manually
// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts

import {
  zBagelUnderstandInput,
  zBagelUnderstandOutput,
} from './zod.gen'

import type {
  BagelUnderstandInput,
  BagelUnderstandOutput,
} from './types.gen'

export type ImageToJsonEndpointMap = {
  'fal-ai/bagel/understand': {
    input: BagelUnderstandInput
    output: BagelUnderstandOutput
  }
}

export const ImageToJsonSchemaMap = {
  ['fal-ai/bagel/understand']: {
    input: zBagelUnderstandInput,
    output: zBagelUnderstandOutput,
  },
} as const

/** Union type of all image-to-json model endpoint IDs */
export type ImageToJsonModel = keyof ImageToJsonEndpointMap

/** Get the input type for a specific image-to-json model */
export type ImageToJsonModelInput<T extends ImageToJsonModel> = ImageToJsonEndpointMap[T]['input']

/** Get the output type for a specific image-to-json model */
export type ImageToJsonModelOutput<T extends ImageToJsonModel> = ImageToJsonEndpointMap[T]['output']
