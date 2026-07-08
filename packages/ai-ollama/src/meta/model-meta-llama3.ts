import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const LLAMA3_LATEST = {
  name: 'llama3:latest',
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

const LLAMA3_8b = {
  name: 'llama3:8b',
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

const LLAMA3_70b = {
  name: 'llama3:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '40gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const LLAMA3_MODELS = [
  LLAMA3_LATEST.name,
  LLAMA3_8b.name,
  LLAMA3_70b.name,
] as const

// const LLAMA3_IMAGE_MODELS = [] as const

// export const LLAMA3_EMBEDDING_MODELS = [] as const

// const LLAMA3_AUDIO_MODELS = [] as const

// const LLAMA3_VIDEO_MODELS = [] as const

// export type Llama3ChatModels = (typeof LLAMA3_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA3_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA3_70b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Llama3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_LATEST.name]: typeof LLAMA3_LATEST.supports.input
  [LLAMA3_8b.name]: typeof LLAMA3_8b.supports.input
  [LLAMA3_70b.name]: typeof LLAMA3_70b.supports.input
}
