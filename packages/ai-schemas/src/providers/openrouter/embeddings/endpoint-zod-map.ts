// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { zEmbeddingsRequest, zEmbeddingsResponse } from './zod.gen.js'

/**
 * Map of openrouter-embeddings endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterEmbeddingsEndpointZodMap: {
  readonly embeddings: {
    readonly input: typeof zEmbeddingsRequest
    readonly output: typeof zEmbeddingsResponse
  }
} = {
  embeddings: { input: zEmbeddingsRequest, output: zEmbeddingsResponse },
}

/** Union of valid openrouter-embeddings endpoint ids. */
export type OpenrouterEmbeddingsEndpointId =
  keyof typeof openrouterEmbeddingsEndpointZodMap
