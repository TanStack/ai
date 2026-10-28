import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const GRANITE3_1_MOE_LATEST = {
  name: 'granite3.1-moe:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '2gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const GRANITE3_1_MOE_1b = {
  name: 'granite3.1-moe:1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '1.4gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const GRANITE3_1_MOE_3b = {
  name: 'granite3.1-moe:3b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '2gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const GRANITE3_1_MOE_MODELS = [
  GRANITE3_1_MOE_LATEST.name,
  GRANITE3_1_MOE_1b.name,
  GRANITE3_1_MOE_3b.name,
] as const

// const GRANITE3_1_MOE_IMAGE_MODELS = [] as const

// export const GRANITE3_1_MOE_EMBEDDING_MODELS = [] as const

// const GRANITE3_1_MOE_AUDIO_MODELS = [] as const

// const GRANITE3_1_MOE_VIDEO_MODELS = [] as const

// export type Granite3_1MoeChatModels = (typeof GRANITE3_1_MOE_MODELS)[number]

// Manual type map for per-model provider options
export type Granite3_1MoeChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GRANITE3_1_MOE_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [GRANITE3_1_MOE_1b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [GRANITE3_1_MOE_3b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Granite3_1MoeModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GRANITE3_1_MOE_LATEST.name]: typeof GRANITE3_1_MOE_LATEST.supports.input
  [GRANITE3_1_MOE_1b.name]: typeof GRANITE3_1_MOE_1b.supports.input
  [GRANITE3_1_MOE_3b.name]: typeof GRANITE3_1_MOE_3b.supports.input
}
