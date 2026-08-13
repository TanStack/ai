import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const MISTRAL_NEMO_LATEST = {
  name: 'mistral-nemo:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '7.1gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const MISTRAL_NEMO_12b = {
  name: 'mistral-nemo:12b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '7.1gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const MISTRAL_NEMO_MODELS = [
  MISTRAL_NEMO_LATEST.name,
  MISTRAL_NEMO_12b.name,
] as const

// const MISTRAL_NEMO_IMAGE_MODELS = [] as const

// export const MISTRAL_NEMO_EMBEDDING_MODELS = [] as const

// const MISTRAL_NEMO_AUDIO_MODELS = [] as const

// const MISTRAL_NEMO_VIDEO_MODELS = [] as const

// export type MistralNemoChatModels = (typeof MISTRAL_NEMO_MODELS)[number]

// Manual type map for per-model provider options
export type MistralNemoChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MISTRAL_NEMO_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [MISTRAL_NEMO_12b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type MistralNemoModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MISTRAL_NEMO_LATEST.name]: typeof MISTRAL_NEMO_LATEST.supports.input
  [MISTRAL_NEMO_12b.name]: typeof MISTRAL_NEMO_12b.supports.input
}
