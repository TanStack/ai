// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  CompactResourceSchema,
  CompactResponseMethodPublicBodySchema,
  ConversationResourceSchema,
  CreateChatCompletionRequestSchema,
  CreateChatCompletionResponseSchema,
  CreateCompletionRequestSchema,
  CreateCompletionResponseSchema,
  CreateConversationBodySchema,
  CreateResponseSchema,
  RealtimeCallCreateRequestSchema,
  RealtimeCallReferRequestSchema,
  RealtimeCallRejectRequestSchema,
  RealtimeCreateClientSecretRequestSchema,
  RealtimeCreateClientSecretResponseSchema,
  RealtimeSessionCreateRequestGASchema,
  RealtimeSessionCreateRequestSchema,
  RealtimeSessionCreateResponseSchema,
  RealtimeTranscriptionSessionCreateRequestSchema,
  RealtimeTranscriptionSessionCreateResponseSchema,
  RealtimeTranslationClientSecretCreateRequestSchema,
  RealtimeTranslationClientSecretCreateResponseSchema,
  ResponseSchema,
  TokenCountsBodySchema,
  TokenCountsResourceSchema,
  UpdateConversationBodySchema,
} from './schemas.gen.js'

/**
 * Map of openai-chat endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiChatEndpointSchemaMap: {
  readonly 'chat/completions': {
    readonly input: typeof CreateChatCompletionRequestSchema
    readonly output: typeof CreateChatCompletionResponseSchema
  }
  readonly completions: {
    readonly input: typeof CreateCompletionRequestSchema
    readonly output: typeof CreateCompletionResponseSchema
  }
  readonly conversations: {
    readonly input: typeof CreateConversationBodySchema
    readonly output: typeof ConversationResourceSchema
  }
  readonly 'conversations/{conversation_id}': {
    readonly input: typeof UpdateConversationBodySchema
    readonly output: typeof ConversationResourceSchema
  }
  readonly 'realtime/calls': {
    readonly input: typeof RealtimeCallCreateRequestSchema
  }
  readonly 'realtime/calls/{call_id}/accept': {
    readonly input: typeof RealtimeSessionCreateRequestGASchema
  }
  readonly 'realtime/calls/{call_id}/refer': {
    readonly input: typeof RealtimeCallReferRequestSchema
  }
  readonly 'realtime/calls/{call_id}/reject': {
    readonly input: typeof RealtimeCallRejectRequestSchema
  }
  readonly 'realtime/client_secrets': {
    readonly input: typeof RealtimeCreateClientSecretRequestSchema
    readonly output: typeof RealtimeCreateClientSecretResponseSchema
  }
  readonly 'realtime/sessions': {
    readonly input: typeof RealtimeSessionCreateRequestSchema
    readonly output: typeof RealtimeSessionCreateResponseSchema
  }
  readonly 'realtime/transcription_sessions': {
    readonly input: typeof RealtimeTranscriptionSessionCreateRequestSchema
    readonly output: typeof RealtimeTranscriptionSessionCreateResponseSchema
  }
  readonly 'realtime/translations/client_secrets': {
    readonly input: typeof RealtimeTranslationClientSecretCreateRequestSchema
    readonly output: typeof RealtimeTranslationClientSecretCreateResponseSchema
  }
  readonly responses: {
    readonly input: typeof CreateResponseSchema
    readonly output: typeof ResponseSchema
  }
  readonly 'responses/compact': {
    readonly input: typeof CompactResponseMethodPublicBodySchema
    readonly output: typeof CompactResourceSchema
  }
  readonly 'responses/input_tokens': {
    readonly input: typeof TokenCountsBodySchema
    readonly output: typeof TokenCountsResourceSchema
  }
} = {
  'chat/completions': {
    input: CreateChatCompletionRequestSchema,
    output: CreateChatCompletionResponseSchema,
  },
  completions: {
    input: CreateCompletionRequestSchema,
    output: CreateCompletionResponseSchema,
  },
  conversations: {
    input: CreateConversationBodySchema,
    output: ConversationResourceSchema,
  },
  'conversations/{conversation_id}': {
    input: UpdateConversationBodySchema,
    output: ConversationResourceSchema,
  },
  'realtime/calls': { input: RealtimeCallCreateRequestSchema },
  'realtime/calls/{call_id}/accept': {
    input: RealtimeSessionCreateRequestGASchema,
  },
  'realtime/calls/{call_id}/refer': { input: RealtimeCallReferRequestSchema },
  'realtime/calls/{call_id}/reject': { input: RealtimeCallRejectRequestSchema },
  'realtime/client_secrets': {
    input: RealtimeCreateClientSecretRequestSchema,
    output: RealtimeCreateClientSecretResponseSchema,
  },
  'realtime/sessions': {
    input: RealtimeSessionCreateRequestSchema,
    output: RealtimeSessionCreateResponseSchema,
  },
  'realtime/transcription_sessions': {
    input: RealtimeTranscriptionSessionCreateRequestSchema,
    output: RealtimeTranscriptionSessionCreateResponseSchema,
  },
  'realtime/translations/client_secrets': {
    input: RealtimeTranslationClientSecretCreateRequestSchema,
    output: RealtimeTranslationClientSecretCreateResponseSchema,
  },
  responses: { input: CreateResponseSchema, output: ResponseSchema },
  'responses/compact': {
    input: CompactResponseMethodPublicBodySchema,
    output: CompactResourceSchema,
  },
  'responses/input_tokens': {
    input: TokenCountsBodySchema,
    output: TokenCountsResourceSchema,
  },
}
