// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zBetaCountMessageTokensParams,
  zBetaCountMessageTokensResponse,
  zBetaCreateMessageParams,
  zBetaMessage,
  zCompletionRequest,
  zCompletionResponse,
  zCountMessageTokensParams,
  zCountMessageTokensResponse,
  zCreateMessageParams,
  zMessage,
} from './zod.gen.js'

/**
 * Map of anthropic-chat endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const anthropicChatEndpointZodMap: {
  readonly 'v1/complete': {
    readonly input: typeof zCompletionRequest
    readonly output: typeof zCompletionResponse
  }
  readonly 'v1/messages': {
    readonly input: typeof zCreateMessageParams
    readonly output: typeof zMessage
  }
  readonly 'v1/messages?beta=true': {
    readonly input: typeof zBetaCreateMessageParams
    readonly output: typeof zBetaMessage
  }
  readonly 'v1/messages/count_tokens': {
    readonly input: typeof zCountMessageTokensParams
    readonly output: typeof zCountMessageTokensResponse
  }
  readonly 'v1/messages/count_tokens?beta=true': {
    readonly input: typeof zBetaCountMessageTokensParams
    readonly output: typeof zBetaCountMessageTokensResponse
  }
} = {
  'v1/complete': { input: zCompletionRequest, output: zCompletionResponse },
  'v1/messages': { input: zCreateMessageParams, output: zMessage },
  'v1/messages?beta=true': {
    input: zBetaCreateMessageParams,
    output: zBetaMessage,
  },
  'v1/messages/count_tokens': {
    input: zCountMessageTokensParams,
    output: zCountMessageTokensResponse,
  },
  'v1/messages/count_tokens?beta=true': {
    input: zBetaCountMessageTokensParams,
    output: zBetaCountMessageTokensResponse,
  },
}

/** Union of valid anthropic-chat endpoint ids. */
export type AnthropicChatEndpointId = keyof typeof anthropicChatEndpointZodMap
