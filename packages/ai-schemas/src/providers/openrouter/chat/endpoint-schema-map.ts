// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  ChatRequestSchema,
  ChatResultSchema,
  MessagesRequestSchema,
  MessagesResultSchema,
  OpenResponsesResultSchema,
  ResponsesRequestSchema,
} from './schemas.gen.js'

/**
 * Map of openrouter-chat endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openrouterChatEndpointSchemaMap: {
  readonly 'chat/completions': {
    readonly input: typeof ChatRequestSchema
    readonly output: typeof ChatResultSchema
  }
  readonly messages: {
    readonly input: typeof MessagesRequestSchema
    readonly output: typeof MessagesResultSchema
  }
  readonly responses: {
    readonly input: typeof ResponsesRequestSchema
    readonly output: typeof OpenResponsesResultSchema
  }
} = {
  'chat/completions': { input: ChatRequestSchema, output: ChatResultSchema },
  messages: { input: MessagesRequestSchema, output: MessagesResultSchema },
  responses: {
    input: ResponsesRequestSchema,
    output: OpenResponsesResultSchema,
  },
}
