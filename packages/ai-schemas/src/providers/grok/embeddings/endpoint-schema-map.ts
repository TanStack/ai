// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  EmbeddingRequestSchema,
  EmbeddingResponseSchema,
} from './schemas.gen.js'

/**
 * Map of grok-embeddings endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokEmbeddingsEndpointSchemaMap: {
  readonly 'v1/embeddings': {
    readonly input: typeof EmbeddingRequestSchema
    readonly output: typeof EmbeddingResponseSchema
  }
} = {
  'v1/embeddings': {
    input: EmbeddingRequestSchema,
    output: EmbeddingResponseSchema,
  },
}
