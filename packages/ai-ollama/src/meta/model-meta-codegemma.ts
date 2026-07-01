import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const CODEGEMMA_LATEST = {
  name: 'codegemma:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const CODEGEMMA_2b = {
  name: 'codegemma:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.65gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const CODEGEMMA_7b = {
  name: 'codegemma:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const CODEGEMMA_MODELS = [
  CODEGEMMA_LATEST.name,
  CODEGEMMA_2b.name,
  CODEGEMMA_7b.name,
] as const

// const CODEGEMMA_IMAGE_MODELS = [] as const

// export const CODEGEMMA_EMBEDDING_MODELS = [] as const

// const CODEGEMMA_AUDIO_MODELS = [] as const

// const CODEGEMMA_VIDEO_MODELS = [] as const

// export type CodegemmaChatModels = (typeof CODEGEMMA_MODELS)[number]

// Manual type map for per-model provider options
export type CodegemmaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [CODEGEMMA_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [CODEGEMMA_2b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [CODEGEMMA_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type CodegemmaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [CODEGEMMA_LATEST.name]: typeof CODEGEMMA_LATEST.supports.input
  [CODEGEMMA_2b.name]: typeof CODEGEMMA_2b.supports.input
  [CODEGEMMA_7b.name]: typeof CODEGEMMA_7b.supports.input
}
