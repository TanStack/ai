import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const NEMOTRON_MINI_LATEST = {
  name: 'nemotron-mini:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '2.7gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const NEMOTRON_MINI_4b = {
  name: 'nemotron-mini:4b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '2.7gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const NEMOTRON_MINI_MODELS = [
  NEMOTRON_MINI_LATEST.name,
  NEMOTRON_MINI_4b.name,
] as const

// const NEMOTRON_MINI_IMAGE_MODELS = [] as const

// export const NEMOTRON_MINI_EMBEDDING_MODELS = [] as const

// const NEMOTRON_MINI_AUDIO_MODELS = [] as const

// const NEMOTRON_MINI_VIDEO_MODELS = [] as const

// export type NemotronMiniChatModels = (typeof NEMOTRON_MINI_MODELS)[number]

// Manual type map for per-model provider options
export type NemotronMiniChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [NEMOTRON_MINI_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [NEMOTRON_MINI_4b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type NemotronMiniModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [NEMOTRON_MINI_LATEST.name]: typeof NEMOTRON_MINI_LATEST.supports.input
  [NEMOTRON_MINI_4b.name]: typeof NEMOTRON_MINI_4b.supports.input
}
