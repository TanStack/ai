// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  OperationSchema,
  PredictLongRunningRequestSchema,
} from './schemas.gen.js'

/**
 * Map of gemini-video endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiVideoEndpointSchemaMap: {
  readonly 'v1beta/models/{modelsId}:predictLongRunning': {
    readonly input: typeof PredictLongRunningRequestSchema
    readonly output: typeof OperationSchema
  }
} = {
  'v1beta/models/{modelsId}:predictLongRunning': {
    input: PredictLongRunningRequestSchema,
    output: OperationSchema,
  },
}
