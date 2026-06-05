// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  CreateImageRequestSchema,
  CreateImageVariationRequestSchema,
  EditImageBodyJsonParamSchema,
  ImagesResponseSchema,
} from './schemas.gen.js'

/**
 * Map of openai-image endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiImageEndpointSchemaMap: {
  readonly 'images/edits': {
    readonly input: typeof EditImageBodyJsonParamSchema
    readonly output: typeof ImagesResponseSchema
  }
  readonly 'images/generations': {
    readonly input: typeof CreateImageRequestSchema
    readonly output: typeof ImagesResponseSchema
  }
  readonly 'images/variations': {
    readonly input: typeof CreateImageVariationRequestSchema
    readonly output: typeof ImagesResponseSchema
  }
} = {
  'images/edits': {
    input: EditImageBodyJsonParamSchema,
    output: ImagesResponseSchema,
  },
  'images/generations': {
    input: CreateImageRequestSchema,
    output: ImagesResponseSchema,
  },
  'images/variations': {
    input: CreateImageVariationRequestSchema,
    output: ImagesResponseSchema,
  },
}
