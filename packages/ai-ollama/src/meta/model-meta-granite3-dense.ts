import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const GRANITE3_DENSE_LATEST = {
  name: 'granite3-dense:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GRANITE3_DENSE_2b = {
  name: 'granite3-dense:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GRANITE3_DENSE_8b = {
  name: 'granite3-dense:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const GRANITE3_DENSE_MODELS = [
  GRANITE3_DENSE_LATEST.name,
  GRANITE3_DENSE_2b.name,
  GRANITE3_DENSE_8b.name,
] as const

// const GRANITE3_DENSE_IMAGE_MODELS = [] as const

// export const GRANITE3_DENSE_EMBEDDING_MODELS = [] as const

// const GRANITE3_DENSE_AUDIO_MODELS = [] as const

// const GRANITE3_DENSE_VIDEO_MODELS = [] as const

// export type Granite3Dense3ChatModels = (typeof GRANITE3_DENSE_MODELS)[number]

// Manual type map for per-model provider options
export type Granite3DenseChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GRANITE3_DENSE_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GRANITE3_DENSE_2b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GRANITE3_DENSE_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Granite3DenseModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GRANITE3_DENSE_LATEST.name]: typeof GRANITE3_DENSE_LATEST.supports.input
  [GRANITE3_DENSE_2b.name]: typeof GRANITE3_DENSE_2b.supports.input
  [GRANITE3_DENSE_8b.name]: typeof GRANITE3_DENSE_8b.supports.input
}
