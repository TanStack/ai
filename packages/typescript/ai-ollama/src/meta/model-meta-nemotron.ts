import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const NEMOTRON_LATEST = {
  name: 'nemotron:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '43gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const NEMOTRON_70b = {
  name: 'nemotron:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '43gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const NEMOTRON_MODELS = [
  NEMOTRON_LATEST.name,
  NEMOTRON_70b.name,
] as const

// const NEMOTRON_IMAGE_MODELS = [] as const

// export const NEMOTRON_EMBEDDING_MODELS = [] as const

// const NEMOTRON_AUDIO_MODELS = [] as const

// const NEMOTRON_VIDEO_MODELS = [] as const

// export type NemotronChatModels = (typeof NEMOTRON_MODELS)[number]

// Manual type map for per-model provider options
export type NemotronChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [NEMOTRON_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [NEMOTRON_70b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type NemotronModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [NEMOTRON_LATEST.name]: typeof NEMOTRON_LATEST.supports.input
  [NEMOTRON_70b.name]: typeof NEMOTRON_70b.supports.input
}
