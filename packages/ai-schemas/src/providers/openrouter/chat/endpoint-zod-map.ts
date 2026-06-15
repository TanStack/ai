// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zChatRequest,
  zChatResult,
  zMessagesRequest,
  zMessagesResult,
  zOpenResponsesResult,
  zResponsesRequest,
} from './zod.gen.js'

/**
 * Map of openrouter-chat endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterChatEndpointZodMap: {
  readonly 'chat/completions': {
    readonly input: typeof zChatRequest
    readonly output: typeof zChatResult
  }
  readonly messages: {
    readonly input: typeof zMessagesRequest
    readonly output: typeof zMessagesResult
  }
  readonly responses: {
    readonly input: typeof zResponsesRequest
    readonly output: typeof zOpenResponsesResult
  }
} = {
  'chat/completions': { input: zChatRequest, output: zChatResult },
  messages: { input: zMessagesRequest, output: zMessagesResult },
  responses: { input: zResponsesRequest, output: zOpenResponsesResult },
}

/** Union of valid openrouter-chat endpoint ids. */
export type OpenrouterChatEndpointId = keyof typeof openrouterChatEndpointZodMap
