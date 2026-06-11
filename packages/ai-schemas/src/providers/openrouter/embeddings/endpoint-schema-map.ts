// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  EmbeddingsRequestSchema,
  EmbeddingsResponseSchema,
} from './schemas.gen.js'

/**
 * Map of openrouter-embeddings endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterEmbeddingsEndpointSchemaMap: {
  readonly embeddings: {
    readonly input: typeof EmbeddingsRequestSchema
    readonly output: typeof EmbeddingsResponseSchema
  }
} = {
  embeddings: {
    input: EmbeddingsRequestSchema,
    output: EmbeddingsResponseSchema,
  },
}
