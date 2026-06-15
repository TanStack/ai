// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  EditImageRequestSchema,
  GenerateImageRequestSchema,
  GeneratedImageResponseSchema,
} from './schemas.gen.js'

/**
 * Map of grok-image endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokImageEndpointSchemaMap: {
  readonly 'v1/images/edits': {
    readonly input: typeof EditImageRequestSchema
    readonly output: typeof GeneratedImageResponseSchema
  }
  readonly 'v1/images/generations': {
    readonly input: typeof GenerateImageRequestSchema
    readonly output: typeof GeneratedImageResponseSchema
  }
} = {
  'v1/images/edits': {
    input: EditImageRequestSchema,
    output: GeneratedImageResponseSchema,
  },
  'v1/images/generations': {
    input: GenerateImageRequestSchema,
    output: GeneratedImageResponseSchema,
  },
}
