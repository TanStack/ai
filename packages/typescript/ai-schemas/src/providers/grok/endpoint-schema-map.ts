// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  ChatRequestSchema,
  ChatResponseSchema,
  CompleteRequestSchema,
  CompleteResponseSchema,
  EditImageRequestSchema,
  EditVideoRequestSchema,
  EmbeddingRequestSchema,
  EmbeddingResponseSchema,
  ExtendVideoRequestSchema,
  GenerateImageRequestSchema,
  GenerateVideoRequestSchema,
  GeneratedImageResponseSchema,
  MessageRequestSchema,
  MessageResponseSchema,
  ModelRequestSchema,
  ModelResponseSchema,
  SampleRequestSchema,
  SampleResponseSchema,
  SearchRequestSchema,
  SearchResponseSchema,
  StartDeferredResponseSchema,
  TokenizeRequestSchema,
  TokenizeResponseSchema,
} from './schemas.gen.js'

/**
 * Map of grok endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 */
export const grokEndpointSchemaMap: {
  readonly 'v1/chat/completions': {
    readonly input: typeof ChatRequestSchema
    readonly output: typeof ChatResponseSchema
  }
  readonly 'v1/complete': {
    readonly input: typeof CompleteRequestSchema
    readonly output: typeof CompleteResponseSchema
  }
  readonly 'v1/completions': {
    readonly input: typeof SampleRequestSchema
    readonly output: typeof SampleResponseSchema
  }
  readonly 'v1/documents/search': {
    readonly input: typeof SearchRequestSchema
    readonly output: typeof SearchResponseSchema
  }
  readonly 'v1/embeddings': {
    readonly input: typeof EmbeddingRequestSchema
    readonly output: typeof EmbeddingResponseSchema
  }
  readonly 'v1/images/edits': {
    readonly input: typeof EditImageRequestSchema
    readonly output: typeof GeneratedImageResponseSchema
  }
  readonly 'v1/images/generations': {
    readonly input: typeof GenerateImageRequestSchema
    readonly output: typeof GeneratedImageResponseSchema
  }
  readonly 'v1/messages': {
    readonly input: typeof MessageRequestSchema
    readonly output: typeof MessageResponseSchema
  }
  readonly 'v1/responses': {
    readonly input: typeof ModelRequestSchema
    readonly output: typeof ModelResponseSchema
  }
  readonly 'v1/tokenize-text': {
    readonly input: typeof TokenizeRequestSchema
    readonly output: typeof TokenizeResponseSchema
  }
  readonly 'v1/videos/edits': {
    readonly input: typeof EditVideoRequestSchema
    readonly output: typeof StartDeferredResponseSchema
  }
  readonly 'v1/videos/extensions': {
    readonly input: typeof ExtendVideoRequestSchema
    readonly output: typeof StartDeferredResponseSchema
  }
  readonly 'v1/videos/generations': {
    readonly input: typeof GenerateVideoRequestSchema
    readonly output: typeof StartDeferredResponseSchema
  }
} = {
  'v1/chat/completions': {
    input: ChatRequestSchema,
    output: ChatResponseSchema,
  },
  'v1/complete': {
    input: CompleteRequestSchema,
    output: CompleteResponseSchema,
  },
  'v1/completions': {
    input: SampleRequestSchema,
    output: SampleResponseSchema,
  },
  'v1/documents/search': {
    input: SearchRequestSchema,
    output: SearchResponseSchema,
  },
  'v1/embeddings': {
    input: EmbeddingRequestSchema,
    output: EmbeddingResponseSchema,
  },
  'v1/images/edits': {
    input: EditImageRequestSchema,
    output: GeneratedImageResponseSchema,
  },
  'v1/images/generations': {
    input: GenerateImageRequestSchema,
    output: GeneratedImageResponseSchema,
  },
  'v1/messages': { input: MessageRequestSchema, output: MessageResponseSchema },
  'v1/responses': { input: ModelRequestSchema, output: ModelResponseSchema },
  'v1/tokenize-text': {
    input: TokenizeRequestSchema,
    output: TokenizeResponseSchema,
  },
  'v1/videos/edits': {
    input: EditVideoRequestSchema,
    output: StartDeferredResponseSchema,
  },
  'v1/videos/extensions': {
    input: ExtendVideoRequestSchema,
    output: StartDeferredResponseSchema,
  },
  'v1/videos/generations': {
    input: GenerateVideoRequestSchema,
    output: StartDeferredResponseSchema,
  },
}
