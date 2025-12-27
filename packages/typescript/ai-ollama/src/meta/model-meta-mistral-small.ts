import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const MISTRAL_SMALL_LATEST = {
  name: 'mistral-small:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '14gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const MISTRAL_SMALL_22b = {
  name: 'mistral-small:22b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '13gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const MISTRAL_SMALL_24b = {
  name: 'mistral-small:24b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '14gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const MISTRAL_SMALL_MODELS = [
  MISTRAL_SMALL_LATEST.name,
  MISTRAL_SMALL_22b.name,
  MISTRAL_SMALL_24b.name,
] as const

// const MISTRAL_SMALL_IMAGE_MODELS = [] as const

// export const MISTRAL_SMALL_EMBEDDING_MODELS = [] as const

// const MISTRAL_SMALL_AUDIO_MODELS = [] as const

// const MISTRAL_SMALL_VIDEO_MODELS = [] as const

// export type MistralSmallChatModels = (typeof MISTRAL_SMALL_MODELS)[number]

// Manual type map for per-model provider options
export type MistralSmallChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MISTRAL_SMALL_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [MISTRAL_SMALL_22b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [MISTRAL_SMALL_24b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type MistralSmallModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MISTRAL_SMALL_LATEST.name]: typeof MISTRAL_SMALL_LATEST.supports.input
  [MISTRAL_SMALL_22b.name]: typeof MISTRAL_SMALL_22b.supports.input
  [MISTRAL_SMALL_24b.name]: typeof MISTRAL_SMALL_24b.supports.input
}
