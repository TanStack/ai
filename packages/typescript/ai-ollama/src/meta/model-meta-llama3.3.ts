import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const LLAMA3_3_LATEST = {
  name: 'llama3.3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '43b',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const LLAMA3_3_70b = {
  name: 'llama3.3:70b',
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

export const LLAMA3_3_MODELS = [
  LLAMA3_3_LATEST.name,
  LLAMA3_3_70b.name,
] as const

// const LLAMA3_3_IMAGE_MODELS = [] as const

// export const LLAMA3_3_EMBEDDING_MODELS = [] as const

// const LLAMA3_3_AUDIO_MODELS = [] as const

// const LLAMA3_3_VIDEO_MODELS = [] as const

// export type Llama3_3ChatModels = (typeof LLAMA3_3_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3_3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_3_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [LLAMA3_3_70b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Llama3_3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_3_LATEST.name]: typeof LLAMA3_3_LATEST.supports.input
  [LLAMA3_3_70b.name]: typeof LLAMA3_3_70b.supports.input
}
