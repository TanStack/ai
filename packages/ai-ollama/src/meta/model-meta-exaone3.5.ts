import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const EXAONE3_5_LATEST = {
  name: 'exaone3.5:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.8gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const EXAONE3_5_2_4b = {
  name: 'exaone3.5:2.4b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const EXAONE3_5_7_1b = {
  name: 'exaone3.5:7.8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.8gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const EXAONE3_5_32b = {
  name: 'exaone3.5:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '19gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const EXAONE3_5MODELS = [
  EXAONE3_5_LATEST.name,
  EXAONE3_5_2_4b.name,
  EXAONE3_5_7_1b.name,
  EXAONE3_5_32b.name,
] as const

// const EXAONE3_5IMAGE_MODELS = [] as const

// export const EXAONE3_5EMBEDDING_MODELS = [] as const

// const EXAONE3_5AUDIO_MODELS = [] as const

// const EXAONE3_5VIDEO_MODELS = [] as const

// export type AyaChatModels = (typeof EXAONE3_5MODELS)[number]

// Manual type map for per-model provider options
export type Exaone3_5ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [EXAONE3_5_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [EXAONE3_5_2_4b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [EXAONE3_5_7_1b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [EXAONE3_5_32b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Exaone3_5ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [EXAONE3_5_LATEST.name]: typeof EXAONE3_5_LATEST.supports.input
  [EXAONE3_5_2_4b.name]: typeof EXAONE3_5_2_4b.supports.input
  [EXAONE3_5_7_1b.name]: typeof EXAONE3_5_7_1b.supports.input
  [EXAONE3_5_32b.name]: typeof EXAONE3_5_32b.supports.input
}
