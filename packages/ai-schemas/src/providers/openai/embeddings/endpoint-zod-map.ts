// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import { zCreateEmbeddingRequest, zCreateEmbeddingResponse } from './zod.gen.js'

/**
 * Map of openai-embeddings endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiEmbeddingsEndpointZodMap: {
  readonly embeddings: {
    readonly input: typeof zCreateEmbeddingRequest
    readonly output: typeof zCreateEmbeddingResponse
  }
} = {
  embeddings: {
    input: zCreateEmbeddingRequest,
    output: zCreateEmbeddingResponse,
  },
}

/** Union of valid openai-embeddings endpoint ids. */
export type OpenaiEmbeddingsEndpointId =
  keyof typeof openaiEmbeddingsEndpointZodMap
