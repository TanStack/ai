import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const LLAMA2_LATEST = {
  name: 'llama2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.8gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA2_7b = {
  name: 'llama2:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.8gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA2_13b = {
  name: 'llama2:13b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '7.4gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA2_70b = {
  name: 'llama2:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '39gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const LLAMA2_MODELS = [
  LLAMA2_LATEST.name,
  LLAMA2_7b.name,
  LLAMA2_13b.name,
  LLAMA2_70b.name,
] as const

// const LLAMA2_IMAGE_MODELS = [] as const

// export const LLAMA2_EMBEDDING_MODELS = [] as const

// const LLAMA2_AUDIO_MODELS = [] as const

// const LLAMA2_VIDEO_MODELS = [] as const

// export type Llama2ChatModels = (typeof LLAMA2_MODELS)[number]

// Manual type map for per-model provider options
export type Llama2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA2_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA2_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA2_13b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA2_70b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Llama2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA2_LATEST.name]: typeof LLAMA2_LATEST.supports.input
  [LLAMA2_7b.name]: typeof LLAMA2_7b.supports.input
  [LLAMA2_13b.name]: typeof LLAMA2_13b.supports.input
  [LLAMA2_70b.name]: typeof LLAMA2_70b.supports.input
}
