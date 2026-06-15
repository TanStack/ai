// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  BatchEmbedContentsRequestSchema,
  BatchEmbedContentsResponseSchema,
  BatchEmbedTextRequestSchema,
  BatchEmbedTextResponseSchema,
  EmbedContentRequestSchema,
  EmbedContentResponseSchema,
  EmbedTextRequestSchema,
  EmbedTextResponseSchema,
} from './schemas.gen.js'

/**
 * Map of gemini-embeddings endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiEmbeddingsEndpointSchemaMap: {
  readonly 'v1beta/models/{modelsId}:batchEmbedContents': {
    readonly input: typeof BatchEmbedContentsRequestSchema
    readonly output: typeof BatchEmbedContentsResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:batchEmbedText': {
    readonly input: typeof BatchEmbedTextRequestSchema
    readonly output: typeof BatchEmbedTextResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:embedContent': {
    readonly input: typeof EmbedContentRequestSchema
    readonly output: typeof EmbedContentResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:embedText': {
    readonly input: typeof EmbedTextRequestSchema
    readonly output: typeof EmbedTextResponseSchema
  }
} = {
  'v1beta/models/{modelsId}:batchEmbedContents': {
    input: BatchEmbedContentsRequestSchema,
    output: BatchEmbedContentsResponseSchema,
  },
  'v1beta/models/{modelsId}:batchEmbedText': {
    input: BatchEmbedTextRequestSchema,
    output: BatchEmbedTextResponseSchema,
  },
  'v1beta/models/{modelsId}:embedContent': {
    input: EmbedContentRequestSchema,
    output: EmbedContentResponseSchema,
  },
  'v1beta/models/{modelsId}:embedText': {
    input: EmbedTextRequestSchema,
    output: EmbedTextResponseSchema,
  },
}
