// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  BetaCountMessageTokensParamsSchema,
  BetaCountMessageTokensResponseSchema,
  BetaCreateMessageParamsSchema,
  BetaMessageSchema,
  CompletionRequestSchema,
  CompletionResponseSchema,
  CountMessageTokensParamsSchema,
  CountMessageTokensResponseSchema,
  CreateMessageParamsSchema,
  MessageSchema,
} from './schemas.gen.js'

/**
 * Map of anthropic-chat endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const anthropicChatEndpointSchemaMap: {
  readonly 'v1/complete': {
    readonly input: typeof CompletionRequestSchema
    readonly output: typeof CompletionResponseSchema
  }
  readonly 'v1/messages': {
    readonly input: typeof CreateMessageParamsSchema
    readonly output: typeof MessageSchema
  }
  readonly 'v1/messages?beta=true': {
    readonly input: typeof BetaCreateMessageParamsSchema
    readonly output: typeof BetaMessageSchema
  }
  readonly 'v1/messages/count_tokens': {
    readonly input: typeof CountMessageTokensParamsSchema
    readonly output: typeof CountMessageTokensResponseSchema
  }
  readonly 'v1/messages/count_tokens?beta=true': {
    readonly input: typeof BetaCountMessageTokensParamsSchema
    readonly output: typeof BetaCountMessageTokensResponseSchema
  }
} = {
  'v1/complete': {
    input: CompletionRequestSchema,
    output: CompletionResponseSchema,
  },
  'v1/messages': { input: CreateMessageParamsSchema, output: MessageSchema },
  'v1/messages?beta=true': {
    input: BetaCreateMessageParamsSchema,
    output: BetaMessageSchema,
  },
  'v1/messages/count_tokens': {
    input: CountMessageTokensParamsSchema,
    output: CountMessageTokensResponseSchema,
  },
  'v1/messages/count_tokens?beta=true': {
    input: BetaCountMessageTokensParamsSchema,
    output: BetaCountMessageTokensResponseSchema,
  },
}
