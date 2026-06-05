// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zCompactResource,
  zCompactResponseMethodPublicBody,
  zConversationResource,
  zCreateChatCompletionRequest,
  zCreateChatCompletionResponse,
  zCreateCompletionRequest,
  zCreateCompletionResponse,
  zCreateConversationBody,
  zCreateResponse,
  zRealtimeCallCreateRequest,
  zRealtimeCallReferRequest,
  zRealtimeCallRejectRequest,
  zRealtimeCreateClientSecretRequest,
  zRealtimeCreateClientSecretResponse,
  zRealtimeSessionCreateRequest,
  zRealtimeSessionCreateRequestGa,
  zRealtimeSessionCreateResponse,
  zRealtimeTranscriptionSessionCreateRequest,
  zRealtimeTranscriptionSessionCreateResponse,
  zRealtimeTranslationClientSecretCreateRequest,
  zRealtimeTranslationClientSecretCreateResponse,
  zResponse,
  zTokenCountsBody,
  zTokenCountsResource,
  zUpdateConversationBody,
} from './zod.gen.js'

/**
 * Map of openai-chat endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const openaiChatEndpointZodMap: {
  readonly 'chat/completions': {
    readonly input: typeof zCreateChatCompletionRequest
    readonly output: typeof zCreateChatCompletionResponse
  }
  readonly completions: {
    readonly input: typeof zCreateCompletionRequest
    readonly output: typeof zCreateCompletionResponse
  }
  readonly conversations: {
    readonly input: typeof zCreateConversationBody
    readonly output: typeof zConversationResource
  }
  readonly 'conversations/{conversation_id}': {
    readonly input: typeof zUpdateConversationBody
    readonly output: typeof zConversationResource
  }
  readonly 'realtime/calls': {
    readonly input: typeof zRealtimeCallCreateRequest
  }
  readonly 'realtime/calls/{call_id}/accept': {
    readonly input: typeof zRealtimeSessionCreateRequestGa
  }
  readonly 'realtime/calls/{call_id}/refer': {
    readonly input: typeof zRealtimeCallReferRequest
  }
  readonly 'realtime/calls/{call_id}/reject': {
    readonly input: typeof zRealtimeCallRejectRequest
  }
  readonly 'realtime/client_secrets': {
    readonly input: typeof zRealtimeCreateClientSecretRequest
    readonly output: typeof zRealtimeCreateClientSecretResponse
  }
  readonly 'realtime/sessions': {
    readonly input: typeof zRealtimeSessionCreateRequest
    readonly output: typeof zRealtimeSessionCreateResponse
  }
  readonly 'realtime/transcription_sessions': {
    readonly input: typeof zRealtimeTranscriptionSessionCreateRequest
    readonly output: typeof zRealtimeTranscriptionSessionCreateResponse
  }
  readonly 'realtime/translations/client_secrets': {
    readonly input: typeof zRealtimeTranslationClientSecretCreateRequest
    readonly output: typeof zRealtimeTranslationClientSecretCreateResponse
  }
  readonly responses: {
    readonly input: typeof zCreateResponse
    readonly output: typeof zResponse
  }
  readonly 'responses/compact': {
    readonly input: typeof zCompactResponseMethodPublicBody
    readonly output: typeof zCompactResource
  }
  readonly 'responses/input_tokens': {
    readonly input: typeof zTokenCountsBody
    readonly output: typeof zTokenCountsResource
  }
} = {
  'chat/completions': {
    input: zCreateChatCompletionRequest,
    output: zCreateChatCompletionResponse,
  },
  completions: {
    input: zCreateCompletionRequest,
    output: zCreateCompletionResponse,
  },
  conversations: {
    input: zCreateConversationBody,
    output: zConversationResource,
  },
  'conversations/{conversation_id}': {
    input: zUpdateConversationBody,
    output: zConversationResource,
  },
  'realtime/calls': { input: zRealtimeCallCreateRequest },
  'realtime/calls/{call_id}/accept': { input: zRealtimeSessionCreateRequestGa },
  'realtime/calls/{call_id}/refer': { input: zRealtimeCallReferRequest },
  'realtime/calls/{call_id}/reject': { input: zRealtimeCallRejectRequest },
  'realtime/client_secrets': {
    input: zRealtimeCreateClientSecretRequest,
    output: zRealtimeCreateClientSecretResponse,
  },
  'realtime/sessions': {
    input: zRealtimeSessionCreateRequest,
    output: zRealtimeSessionCreateResponse,
  },
  'realtime/transcription_sessions': {
    input: zRealtimeTranscriptionSessionCreateRequest,
    output: zRealtimeTranscriptionSessionCreateResponse,
  },
  'realtime/translations/client_secrets': {
    input: zRealtimeTranslationClientSecretCreateRequest,
    output: zRealtimeTranslationClientSecretCreateResponse,
  },
  responses: { input: zCreateResponse, output: zResponse },
  'responses/compact': {
    input: zCompactResponseMethodPublicBody,
    output: zCompactResource,
  },
  'responses/input_tokens': {
    input: zTokenCountsBody,
    output: zTokenCountsResource,
  },
}

/** Union of valid openai-chat endpoint ids. */
export type OpenaiChatEndpointId = keyof typeof openaiChatEndpointZodMap
