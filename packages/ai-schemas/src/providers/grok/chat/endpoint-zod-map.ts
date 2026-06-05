// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zChatRequest,
  zChatResponse,
  zCompleteRequest,
  zCompleteResponse,
  zMessageRequest,
  zMessageResponse,
  zModelRequest,
  zModelResponse,
  zSampleRequest,
  zSampleResponse,
  zTokenizeRequest,
  zTokenizeResponse,
} from './zod.gen.js'

/**
 * Map of grok-chat endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const grokChatEndpointZodMap: {
  readonly 'v1/chat/completions': {
    readonly input: typeof zChatRequest
    readonly output: typeof zChatResponse
  }
  readonly 'v1/complete': {
    readonly input: typeof zCompleteRequest
    readonly output: typeof zCompleteResponse
  }
  readonly 'v1/completions': {
    readonly input: typeof zSampleRequest
    readonly output: typeof zSampleResponse
  }
  readonly 'v1/messages': {
    readonly input: typeof zMessageRequest
    readonly output: typeof zMessageResponse
  }
  readonly 'v1/responses': {
    readonly input: typeof zModelRequest
    readonly output: typeof zModelResponse
  }
  readonly 'v1/tokenize-text': {
    readonly input: typeof zTokenizeRequest
    readonly output: typeof zTokenizeResponse
  }
} = {
  'v1/chat/completions': { input: zChatRequest, output: zChatResponse },
  'v1/complete': { input: zCompleteRequest, output: zCompleteResponse },
  'v1/completions': { input: zSampleRequest, output: zSampleResponse },
  'v1/messages': { input: zMessageRequest, output: zMessageResponse },
  'v1/responses': { input: zModelRequest, output: zModelResponse },
  'v1/tokenize-text': { input: zTokenizeRequest, output: zTokenizeResponse },
}

/** Union of valid grok-chat endpoint ids. */
export type GrokChatEndpointId = keyof typeof grokChatEndpointZodMap
