// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { PredictRequestSchema, PredictResponseSchema } from './schemas.gen.js'

/**
 * Map of gemini-image endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiImageEndpointSchemaMap: {
  readonly 'v1beta/models/{modelsId}:predict': {
    readonly input: typeof PredictRequestSchema
    readonly output: typeof PredictResponseSchema
  }
} = {
  'v1beta/models/{modelsId}:predict': {
    input: PredictRequestSchema,
    output: PredictResponseSchema,
  },
}
