// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { zEmbeddingRequest, zEmbeddingResponse } from './zod.gen.js'

/**
 * Map of grok-embeddings endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokEmbeddingsEndpointZodMap: {
  readonly 'v1/embeddings': {
    readonly input: typeof zEmbeddingRequest
    readonly output: typeof zEmbeddingResponse
  }
} = {
  'v1/embeddings': { input: zEmbeddingRequest, output: zEmbeddingResponse },
}

/** Union of valid grok-embeddings endpoint ids. */
export type GrokEmbeddingsEndpointId = keyof typeof grokEmbeddingsEndpointZodMap
