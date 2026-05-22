// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zChatRequest,
  zChatResponse,
  zCompleteRequest,
  zCompleteResponse,
  zEditImageRequest,
  zEditVideoRequest,
  zEmbeddingRequest,
  zEmbeddingResponse,
  zExtendVideoRequest,
  zGenerateImageRequest,
  zGenerateVideoRequest,
  zGeneratedImageResponse,
  zMessageRequest,
  zMessageResponse,
  zModelRequest,
  zModelResponse,
  zSampleRequest,
  zSampleResponse,
  zSearchRequest,
  zSearchResponse,
  zStartDeferredResponse,
  zTokenizeRequest,
  zTokenizeResponse,
} from './zod.gen.js'

/** Map of grok endpoint id -> Zod input/output schemas. */
export const grokEndpointZodMap: {
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
  readonly 'v1/documents/search': {
    readonly input: typeof zSearchRequest
    readonly output: typeof zSearchResponse
  }
  readonly 'v1/embeddings': {
    readonly input: typeof zEmbeddingRequest
    readonly output: typeof zEmbeddingResponse
  }
  readonly 'v1/images/edits': {
    readonly input: typeof zEditImageRequest
    readonly output: typeof zGeneratedImageResponse
  }
  readonly 'v1/images/generations': {
    readonly input: typeof zGenerateImageRequest
    readonly output: typeof zGeneratedImageResponse
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
  readonly 'v1/videos/edits': {
    readonly input: typeof zEditVideoRequest
    readonly output: typeof zStartDeferredResponse
  }
  readonly 'v1/videos/extensions': {
    readonly input: typeof zExtendVideoRequest
    readonly output: typeof zStartDeferredResponse
  }
  readonly 'v1/videos/generations': {
    readonly input: typeof zGenerateVideoRequest
    readonly output: typeof zStartDeferredResponse
  }
} = {
  'v1/chat/completions': { input: zChatRequest, output: zChatResponse },
  'v1/complete': { input: zCompleteRequest, output: zCompleteResponse },
  'v1/completions': { input: zSampleRequest, output: zSampleResponse },
  'v1/documents/search': { input: zSearchRequest, output: zSearchResponse },
  'v1/embeddings': { input: zEmbeddingRequest, output: zEmbeddingResponse },
  'v1/images/edits': {
    input: zEditImageRequest,
    output: zGeneratedImageResponse,
  },
  'v1/images/generations': {
    input: zGenerateImageRequest,
    output: zGeneratedImageResponse,
  },
  'v1/messages': { input: zMessageRequest, output: zMessageResponse },
  'v1/responses': { input: zModelRequest, output: zModelResponse },
  'v1/tokenize-text': { input: zTokenizeRequest, output: zTokenizeResponse },
  'v1/videos/edits': {
    input: zEditVideoRequest,
    output: zStartDeferredResponse,
  },
  'v1/videos/extensions': {
    input: zExtendVideoRequest,
    output: zStartDeferredResponse,
  },
  'v1/videos/generations': {
    input: zGenerateVideoRequest,
    output: zStartDeferredResponse,
  },
}

/** Union of valid grok endpoint ids. */
export type GrokEndpointId = keyof typeof grokEndpointZodMap
