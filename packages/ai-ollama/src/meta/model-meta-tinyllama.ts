import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const TINYLLAMA_LATEST = {
  name: 'tinyllama:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '638mb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const TINYLLAMA_1_1b = {
  name: 'tinyllama:1.1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '638mb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const TINYLLAMA_MODELS = [
  TINYLLAMA_LATEST.name,
  TINYLLAMA_1_1b.name,
] as const

// const TINYLLAMA_IMAGE_MODELS = [] as const

// export const TINYLLAMA_EMBEDDING_MODELS = [] as const

// const TINYLLAMA_AUDIO_MODELS = [] as const

// const TINYLLAMA_VIDEO_MODELS = [] as const

// export type TinyllamaChatModels = (typeof TINYLLAMA_MODELS)[number]

// Manual type map for per-model provider options
export type TinyllamaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [TINYLLAMA_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [TINYLLAMA_1_1b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type TinyllamaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [TINYLLAMA_LATEST.name]: typeof TINYLLAMA_LATEST.supports.input
  [TINYLLAMA_1_1b.name]: typeof TINYLLAMA_1_1b.supports.input
}
