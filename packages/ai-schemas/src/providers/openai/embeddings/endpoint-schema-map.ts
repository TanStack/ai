// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  CreateEmbeddingRequestSchema,
  CreateEmbeddingResponseSchema,
} from './schemas.gen.js'

/**
 * Map of openai-embeddings endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiEmbeddingsEndpointSchemaMap: {
  readonly embeddings: {
    readonly input: typeof CreateEmbeddingRequestSchema
    readonly output: typeof CreateEmbeddingResponseSchema
  }
} = {
  embeddings: {
    input: CreateEmbeddingRequestSchema,
    output: CreateEmbeddingResponseSchema,
  },
}
