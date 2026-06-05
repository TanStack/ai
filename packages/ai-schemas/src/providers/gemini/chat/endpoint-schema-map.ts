// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  CountMessageTokensRequestSchema,
  CountMessageTokensResponseSchema,
  CountTextTokensRequestSchema,
  CountTextTokensResponseSchema,
  CountTokensRequestSchema,
  CountTokensResponseSchema,
  GenerateAnswerRequestSchema,
  GenerateAnswerResponseSchema,
  GenerateContentRequestSchema,
  GenerateContentResponseSchema,
  GenerateMessageRequestSchema,
  GenerateMessageResponseSchema,
  GenerateTextRequestSchema,
  GenerateTextResponseSchema,
} from './schemas.gen.js'

/**
 * Map of gemini-chat endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const geminiChatEndpointSchemaMap: {
  readonly 'v1beta/dynamic/{dynamicId}:generateContent': {
    readonly input: typeof GenerateContentRequestSchema
    readonly output: typeof GenerateContentResponseSchema
  }
  readonly 'v1beta/dynamic/{dynamicId}:streamGenerateContent': {
    readonly input: typeof GenerateContentRequestSchema
    readonly output: typeof GenerateContentResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:countMessageTokens': {
    readonly input: typeof CountMessageTokensRequestSchema
    readonly output: typeof CountMessageTokensResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:countTextTokens': {
    readonly input: typeof CountTextTokensRequestSchema
    readonly output: typeof CountTextTokensResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:countTokens': {
    readonly input: typeof CountTokensRequestSchema
    readonly output: typeof CountTokensResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:generateAnswer': {
    readonly input: typeof GenerateAnswerRequestSchema
    readonly output: typeof GenerateAnswerResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:generateContent': {
    readonly input: typeof GenerateContentRequestSchema
    readonly output: typeof GenerateContentResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:generateMessage': {
    readonly input: typeof GenerateMessageRequestSchema
    readonly output: typeof GenerateMessageResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:generateText': {
    readonly input: typeof GenerateTextRequestSchema
    readonly output: typeof GenerateTextResponseSchema
  }
  readonly 'v1beta/models/{modelsId}:streamGenerateContent': {
    readonly input: typeof GenerateContentRequestSchema
    readonly output: typeof GenerateContentResponseSchema
  }
  readonly 'v1beta/tunedModels/{tunedModelsId}:generateContent': {
    readonly input: typeof GenerateContentRequestSchema
    readonly output: typeof GenerateContentResponseSchema
  }
  readonly 'v1beta/tunedModels/{tunedModelsId}:generateText': {
    readonly input: typeof GenerateTextRequestSchema
    readonly output: typeof GenerateTextResponseSchema
  }
  readonly 'v1beta/tunedModels/{tunedModelsId}:streamGenerateContent': {
    readonly input: typeof GenerateContentRequestSchema
    readonly output: typeof GenerateContentResponseSchema
  }
} = {
  'v1beta/dynamic/{dynamicId}:generateContent': {
    input: GenerateContentRequestSchema,
    output: GenerateContentResponseSchema,
  },
  'v1beta/dynamic/{dynamicId}:streamGenerateContent': {
    input: GenerateContentRequestSchema,
    output: GenerateContentResponseSchema,
  },
  'v1beta/models/{modelsId}:countMessageTokens': {
    input: CountMessageTokensRequestSchema,
    output: CountMessageTokensResponseSchema,
  },
  'v1beta/models/{modelsId}:countTextTokens': {
    input: CountTextTokensRequestSchema,
    output: CountTextTokensResponseSchema,
  },
  'v1beta/models/{modelsId}:countTokens': {
    input: CountTokensRequestSchema,
    output: CountTokensResponseSchema,
  },
  'v1beta/models/{modelsId}:generateAnswer': {
    input: GenerateAnswerRequestSchema,
    output: GenerateAnswerResponseSchema,
  },
  'v1beta/models/{modelsId}:generateContent': {
    input: GenerateContentRequestSchema,
    output: GenerateContentResponseSchema,
  },
  'v1beta/models/{modelsId}:generateMessage': {
    input: GenerateMessageRequestSchema,
    output: GenerateMessageResponseSchema,
  },
  'v1beta/models/{modelsId}:generateText': {
    input: GenerateTextRequestSchema,
    output: GenerateTextResponseSchema,
  },
  'v1beta/models/{modelsId}:streamGenerateContent': {
    input: GenerateContentRequestSchema,
    output: GenerateContentResponseSchema,
  },
  'v1beta/tunedModels/{tunedModelsId}:generateContent': {
    input: GenerateContentRequestSchema,
    output: GenerateContentResponseSchema,
  },
  'v1beta/tunedModels/{tunedModelsId}:generateText': {
    input: GenerateTextRequestSchema,
    output: GenerateTextResponseSchema,
  },
  'v1beta/tunedModels/{tunedModelsId}:streamGenerateContent': {
    input: GenerateContentRequestSchema,
    output: GenerateContentResponseSchema,
  },
}
