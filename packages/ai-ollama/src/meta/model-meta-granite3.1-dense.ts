import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const GRANITE3_1_DENSE_LATEST = {
  name: 'granite3.1-dense:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '5gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const GRANITE3_1_DENSE_2b = {
  name: 'granite3.1-dense:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '1.6gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const GRANITE3_1_DENSE_8b = {
  name: 'granite3.1-dense:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '5gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const GRANITE3_1_DENSE_MODELS = [
  GRANITE3_1_DENSE_LATEST.name,
  GRANITE3_1_DENSE_2b.name,
  GRANITE3_1_DENSE_8b.name,
] as const

// const GRANITE3_1_DENSE_IMAGE_MODELS = [] as const

// export const GRANITE3_1_DENSE_EMBEDDING_MODELS = [] as const

// const GRANITE3_1_DENSE_AUDIO_MODELS = [] as const

// const GRANITE3_1_DENSE_VIDEO_MODELS = [] as const

// export type Granite3_1Dense3ChatModels = (typeof GRANITE3_1_DENSE_MODELS)[number]

// Manual type map for per-model provider options
export type Granite3_1DenseChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GRANITE3_1_DENSE_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [GRANITE3_1_DENSE_2b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [GRANITE3_1_DENSE_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Granite3_1DenseModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GRANITE3_1_DENSE_LATEST.name]: typeof GRANITE3_1_DENSE_LATEST.supports.input
  [GRANITE3_1_DENSE_2b.name]: typeof GRANITE3_1_DENSE_2b.supports.input
  [GRANITE3_1_DENSE_8b.name]: typeof GRANITE3_1_DENSE_8b.supports.input
}
