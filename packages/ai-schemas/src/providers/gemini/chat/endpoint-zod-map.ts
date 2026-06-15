// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zCountMessageTokensRequest,
  zCountMessageTokensResponse,
  zCountTextTokensRequest,
  zCountTextTokensResponse,
  zCountTokensRequest,
  zCountTokensResponse,
  zGenerateAnswerRequest,
  zGenerateAnswerResponse,
  zGenerateContentRequest,
  zGenerateContentResponse,
  zGenerateMessageRequest,
  zGenerateMessageResponse,
  zGenerateTextRequest,
  zGenerateTextResponse,
} from './zod.gen.js'

/**
 * Map of gemini-chat endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiChatEndpointZodMap: {
  readonly 'v1beta/dynamic/{dynamicId}:generateContent': {
    readonly input: typeof zGenerateContentRequest
    readonly output: typeof zGenerateContentResponse
  }
  readonly 'v1beta/dynamic/{dynamicId}:streamGenerateContent': {
    readonly input: typeof zGenerateContentRequest
    readonly output: typeof zGenerateContentResponse
  }
  readonly 'v1beta/models/{modelsId}:countMessageTokens': {
    readonly input: typeof zCountMessageTokensRequest
    readonly output: typeof zCountMessageTokensResponse
  }
  readonly 'v1beta/models/{modelsId}:countTextTokens': {
    readonly input: typeof zCountTextTokensRequest
    readonly output: typeof zCountTextTokensResponse
  }
  readonly 'v1beta/models/{modelsId}:countTokens': {
    readonly input: typeof zCountTokensRequest
    readonly output: typeof zCountTokensResponse
  }
  readonly 'v1beta/models/{modelsId}:generateAnswer': {
    readonly input: typeof zGenerateAnswerRequest
    readonly output: typeof zGenerateAnswerResponse
  }
  readonly 'v1beta/models/{modelsId}:generateContent': {
    readonly input: typeof zGenerateContentRequest
    readonly output: typeof zGenerateContentResponse
  }
  readonly 'v1beta/models/{modelsId}:generateMessage': {
    readonly input: typeof zGenerateMessageRequest
    readonly output: typeof zGenerateMessageResponse
  }
  readonly 'v1beta/models/{modelsId}:generateText': {
    readonly input: typeof zGenerateTextRequest
    readonly output: typeof zGenerateTextResponse
  }
  readonly 'v1beta/models/{modelsId}:streamGenerateContent': {
    readonly input: typeof zGenerateContentRequest
    readonly output: typeof zGenerateContentResponse
  }
  readonly 'v1beta/tunedModels/{tunedModelsId}:generateContent': {
    readonly input: typeof zGenerateContentRequest
    readonly output: typeof zGenerateContentResponse
  }
  readonly 'v1beta/tunedModels/{tunedModelsId}:generateText': {
    readonly input: typeof zGenerateTextRequest
    readonly output: typeof zGenerateTextResponse
  }
  readonly 'v1beta/tunedModels/{tunedModelsId}:streamGenerateContent': {
    readonly input: typeof zGenerateContentRequest
    readonly output: typeof zGenerateContentResponse
  }
} = {
  'v1beta/dynamic/{dynamicId}:generateContent': {
    input: zGenerateContentRequest,
    output: zGenerateContentResponse,
  },
  'v1beta/dynamic/{dynamicId}:streamGenerateContent': {
    input: zGenerateContentRequest,
    output: zGenerateContentResponse,
  },
  'v1beta/models/{modelsId}:countMessageTokens': {
    input: zCountMessageTokensRequest,
    output: zCountMessageTokensResponse,
  },
  'v1beta/models/{modelsId}:countTextTokens': {
    input: zCountTextTokensRequest,
    output: zCountTextTokensResponse,
  },
  'v1beta/models/{modelsId}:countTokens': {
    input: zCountTokensRequest,
    output: zCountTokensResponse,
  },
  'v1beta/models/{modelsId}:generateAnswer': {
    input: zGenerateAnswerRequest,
    output: zGenerateAnswerResponse,
  },
  'v1beta/models/{modelsId}:generateContent': {
    input: zGenerateContentRequest,
    output: zGenerateContentResponse,
  },
  'v1beta/models/{modelsId}:generateMessage': {
    input: zGenerateMessageRequest,
    output: zGenerateMessageResponse,
  },
  'v1beta/models/{modelsId}:generateText': {
    input: zGenerateTextRequest,
    output: zGenerateTextResponse,
  },
  'v1beta/models/{modelsId}:streamGenerateContent': {
    input: zGenerateContentRequest,
    output: zGenerateContentResponse,
  },
  'v1beta/tunedModels/{tunedModelsId}:generateContent': {
    input: zGenerateContentRequest,
    output: zGenerateContentResponse,
  },
  'v1beta/tunedModels/{tunedModelsId}:generateText': {
    input: zGenerateTextRequest,
    output: zGenerateTextResponse,
  },
  'v1beta/tunedModels/{tunedModelsId}:streamGenerateContent': {
    input: zGenerateContentRequest,
    output: zGenerateContentResponse,
  },
}

/** Union of valid gemini-chat endpoint ids. */
export type GeminiChatEndpointId = keyof typeof geminiChatEndpointZodMap
