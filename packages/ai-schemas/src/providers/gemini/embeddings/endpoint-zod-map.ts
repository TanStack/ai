// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zBatchEmbedContentsRequest,
  zBatchEmbedContentsResponse,
  zBatchEmbedTextRequest,
  zBatchEmbedTextResponse,
  zEmbedContentRequest,
  zEmbedContentResponse,
  zEmbedTextRequest,
  zEmbedTextResponse,
} from './zod.gen.js'

/**
 * Map of gemini-embeddings endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiEmbeddingsEndpointZodMap: {
  readonly 'v1beta/models/{modelsId}:batchEmbedContents': {
    readonly input: typeof zBatchEmbedContentsRequest
    readonly output: typeof zBatchEmbedContentsResponse
  }
  readonly 'v1beta/models/{modelsId}:batchEmbedText': {
    readonly input: typeof zBatchEmbedTextRequest
    readonly output: typeof zBatchEmbedTextResponse
  }
  readonly 'v1beta/models/{modelsId}:embedContent': {
    readonly input: typeof zEmbedContentRequest
    readonly output: typeof zEmbedContentResponse
  }
  readonly 'v1beta/models/{modelsId}:embedText': {
    readonly input: typeof zEmbedTextRequest
    readonly output: typeof zEmbedTextResponse
  }
} = {
  'v1beta/models/{modelsId}:batchEmbedContents': {
    input: zBatchEmbedContentsRequest,
    output: zBatchEmbedContentsResponse,
  },
  'v1beta/models/{modelsId}:batchEmbedText': {
    input: zBatchEmbedTextRequest,
    output: zBatchEmbedTextResponse,
  },
  'v1beta/models/{modelsId}:embedContent': {
    input: zEmbedContentRequest,
    output: zEmbedContentResponse,
  },
  'v1beta/models/{modelsId}:embedText': {
    input: zEmbedTextRequest,
    output: zEmbedTextResponse,
  },
}

/** Union of valid gemini-embeddings endpoint ids. */
export type GeminiEmbeddingsEndpointId =
  keyof typeof geminiEmbeddingsEndpointZodMap
