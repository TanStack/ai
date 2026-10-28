import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const ATHENE_V2_LATEST = {
  name: 'athene-v2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '47gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const ATHENE_V2_72b = {
  name: 'athene-v2:72b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '47gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const ATHENE_MODELS = [
  ATHENE_V2_LATEST.name,
  ATHENE_V2_72b.name,
] as const

// const ATHENE_IMAGE_MODELS = [] as const

// export const ATHENE_EMBEDDING_MODELS = [] as const

// const ATHENE_AUDIO_MODELS = [] as const

// const ATHENE_VIDEO_MODELS = [] as const

// export type AtheneChatModels = (typeof ATHENE_MODELS)[number]

// Manual type map for per-model provider options
export type AtheneChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [ATHENE_V2_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [ATHENE_V2_72b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type AtheneModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [ATHENE_V2_LATEST.name]: typeof ATHENE_V2_LATEST.supports.input
  [ATHENE_V2_72b.name]: typeof ATHENE_V2_72b.supports.input
}
