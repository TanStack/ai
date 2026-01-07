import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const LLAMA3_GRADIENT_LATEST = {
  name: 'llama3-gradient:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 1_000_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA3_GRADIENT_8b = {
  name: 'llama3-gradient:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 1_000_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA3_GRADIENT_70b = {
  name: 'llama3-gradient:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '40gb',
  context: 1_000_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const LLAMA3_GRADIENT_MODELS = [
  LLAMA3_GRADIENT_LATEST.name,
  LLAMA3_GRADIENT_8b.name,
  LLAMA3_GRADIENT_70b.name,
] as const

// const LLAMA3_GRADIENT_IMAGE_MODELS = [] as const

// export const LLAMA3_GRADIENT_EMBEDDING_MODELS = [] as const

// const LLAMA3_GRADIENT_AUDIO_MODELS = [] as const

// const LLAMA3_GRADIENT_VIDEO_MODELS = [] as const

// export type Llama3GradientChatModels = (typeof LLAMA3_GRADIENT_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3GradientChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_GRADIENT_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA3_GRADIENT_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA3_GRADIENT_70b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Llama3GradientModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_GRADIENT_LATEST.name]: typeof LLAMA3_GRADIENT_LATEST.supports.input
  [LLAMA3_GRADIENT_8b.name]: typeof LLAMA3_GRADIENT_8b.supports.input
  [LLAMA3_GRADIENT_70b.name]: typeof LLAMA3_GRADIENT_70b.supports.input
}
