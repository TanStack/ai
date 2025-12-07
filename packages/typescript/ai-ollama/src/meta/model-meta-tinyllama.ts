import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const TINNYLLAMA_LATEST = {
  name: 'tinnyllama:latest',
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

const TINNYLLAMA_1_1b = {
  name: 'tinnyllama:1.1b',
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

export const TINNYLLAMA_MODELS = [
  TINNYLLAMA_LATEST.name,
  TINNYLLAMA_1_1b.name,
] as const

// const TINNYLLAMA_IMAGE_MODELS = [] as const

// export const TINNYLLAMA_EMBEDDING_MODELS = [] as const

// const TINNYLLAMA_AUDIO_MODELS = [] as const

// const TINNYLLAMA_VIDEO_MODELS = [] as const

// export type TinnyllamaChatModels = (typeof TINNYLLAMA_MODELS)[number]

// Manual type map for per-model provider options
export type TinnyllamaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [TINNYLLAMA_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [TINNYLLAMA_1_1b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type TinnyllamaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [TINNYLLAMA_LATEST.name]: typeof TINNYLLAMA_LATEST.supports.input
  [TINNYLLAMA_1_1b.name]: typeof TINNYLLAMA_1_1b.supports.input
}
