import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const GEMMA2_LATEST = {
  name: 'gemma2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.4gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GEMMA2_2b = {
  name: 'gemma2:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GEMMA2_9b = {
  name: 'gemma2:9b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.4gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GEMMA2_27b = {
  name: 'gemma2:27b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '16gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const GEMMA2_MODELS = [
  GEMMA2_LATEST.name,
  GEMMA2_2b.name,
  GEMMA2_9b.name,
  GEMMA2_27b.name,
] as const

// const GEMMA2_IMAGE_MODELS = [] as const

// export const GEMMA2_EMBEDDING_MODELS = [] as const

// const GEMMA2_AUDIO_MODELS = [] as const

// const GEMMA2_VIDEO_MODELS = [] as const

// export type Gemma2ChatModels = (typeof GEMMA2_MODELS)[number]

// Manual type map for per-model provider options
export type Gemma2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GEMMA2_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GEMMA2_2b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GEMMA2_9b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GEMMA2_27b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Gemma2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GEMMA2_LATEST.name]: typeof GEMMA2_LATEST.supports.input
  [GEMMA2_2b.name]: typeof GEMMA2_2b.supports.input
  [GEMMA2_9b.name]: typeof GEMMA2_9b.supports.input
  [GEMMA2_27b.name]: typeof GEMMA2_27b.supports.input
}
