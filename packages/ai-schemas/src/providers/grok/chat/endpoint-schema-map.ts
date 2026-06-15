// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  ChatRequestSchema,
  ChatResponseSchema,
  CompleteRequestSchema,
  CompleteResponseSchema,
  MessageRequestSchema,
  MessageResponseSchema,
  ModelRequestSchema,
  ModelResponseSchema,
  SampleRequestSchema,
  SampleResponseSchema,
  TokenizeRequestSchema,
  TokenizeResponseSchema,
} from './schemas.gen.js'

/**
 * Map of grok-chat endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokChatEndpointSchemaMap: {
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
  'v1/messages': { input: MessageRequestSchema, output: MessageResponseSchema },
  'v1/responses': { input: ModelRequestSchema, output: ModelResponseSchema },
  'v1/tokenize-text': {
    input: TokenizeRequestSchema,
    output: TokenizeResponseSchema,
  },
}
