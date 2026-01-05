import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const LLAMA3_1_LATEST = {
  name: 'llama3.1:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const LLAMA3_1_8b = {
  name: 'llama3.1:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const LLAMA3_1_70b = {
  name: 'llama3.1:70b',
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

const LLAMA3_1_405b = {
  name: 'llama3.1:405b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '243gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const LLAMA3_1_MODELS = [
  LLAMA3_1_LATEST.name,
  LLAMA3_1_8b.name,
  LLAMA3_1_70b.name,
  LLAMA3_1_405b.name,
] as const

// const LLAMA3_1_IMAGE_MODELS = [] as const

// export const LLAMA3_1_EMBEDDING_MODELS = [] as const

// const LLAMA3_1_AUDIO_MODELS = [] as const

// const LLAMA3_1_VIDEO_MODELS = [] as const

// export type Llama3_1ChatModels = (typeof LLAMA3_1_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3_1ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_1_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [LLAMA3_1_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [LLAMA3_1_70b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [LLAMA3_1_405b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Llama3_1ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_1_LATEST.name]: typeof LLAMA3_1_LATEST.supports.input
  [LLAMA3_1_8b.name]: typeof LLAMA3_1_8b.supports.input
  [LLAMA3_1_70b.name]: typeof LLAMA3_1_70b.supports.input
  [LLAMA3_1_405b.name]: typeof LLAMA3_1_405b.supports.input
}
