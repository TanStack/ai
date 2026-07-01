import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const GEMMA_LATEST = {
  name: 'gemma:latest',
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

const GEMMA_2b = {
  name: 'gemma:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GEMMA_7b = {
  name: 'gemma:7b',
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

export const GEMMA_MODELS = [
  GEMMA_LATEST.name,
  GEMMA_2b.name,
  GEMMA_7b.name,
] as const

// const GEMMA_IMAGE_MODELS = [] as const

// export const GEMMA_EMBEDDING_MODELS = [] as const

// const GEMMA_AUDIO_MODELS = [] as const

// const GEMMA_VIDEO_MODELS = [] as const

// export type GemmaChatModels = (typeof GEMMA_MODELS)[number]

// Manual type map for per-model provider options
export type GemmaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GEMMA_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GEMMA_2b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GEMMA_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type GemmaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GEMMA_LATEST.name]: typeof GEMMA_LATEST.supports.input
  [GEMMA_2b.name]: typeof GEMMA_2b.supports.input
  [GEMMA_7b.name]: typeof GEMMA_7b.supports.input
}
