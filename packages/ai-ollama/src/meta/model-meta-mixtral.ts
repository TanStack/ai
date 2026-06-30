import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const MIXTRAL_LATEST = {
  name: 'mixtral:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '26gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const MIXTRAL_8X7b = {
  name: 'mixtral:8x7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '26gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const MIXTRAL_8X22b = {
  name: 'mixtral:8x22b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '80gb',
  context: 64_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const MIXTRAL_MODELS = [
  MIXTRAL_LATEST.name,
  MIXTRAL_8X7b.name,
  MIXTRAL_8X22b.name,
] as const

// const MIXTRAL_IMAGE_MODELS = [] as const

// export const MIXTRAL_EMBEDDING_MODELS = [] as const

// const MIXTRAL_AUDIO_MODELS = [] as const

// const MIXTRAL_VIDEO_MODELS = [] as const

// export type MixtralChatModels = (typeof MIXTRAL_MODELS)[number]

// Manual type map for per-model provider options
export type MixtralChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MIXTRAL_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [MIXTRAL_8X7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [MIXTRAL_8X22b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type MixtralModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MIXTRAL_LATEST.name]: typeof MIXTRAL_LATEST.supports.input
  [MIXTRAL_8X7b.name]: typeof MIXTRAL_8X7b.supports.input
  [MIXTRAL_8X22b.name]: typeof MIXTRAL_8X22b.supports.input
}
