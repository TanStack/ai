import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const OPENCODER_LATEST = {
  name: 'opencoder:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const OPENCODER_1_5b = {
  name: 'opencoder:1.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.4gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const OPENCODER_8b = {
  name: 'opencoder:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const OPENCODER_MODELS = [
  OPENCODER_LATEST.name,
  OPENCODER_1_5b.name,
  OPENCODER_8b.name,
] as const

// const OPENCODER_IMAGE_MODELS = [] as const

// export const OPENCODER_EMBEDDING_MODELS = [] as const

// const OPENCODER_AUDIO_MODELS = [] as const

// const OPENCODER_VIDEO_MODELS = [] as const

// export type OpencoderChatModels = (typeof OPENCODER_MODELS)[number]

// Manual type map for per-model provider options
export type OpencoderChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [OPENCODER_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [OPENCODER_1_5b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [OPENCODER_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type OpencoderModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [OPENCODER_LATEST.name]: typeof OPENCODER_LATEST.supports.input
  [OPENCODER_1_5b.name]: typeof OPENCODER_1_5b.supports.input
  [OPENCODER_8b.name]: typeof OPENCODER_8b.supports.input
}
