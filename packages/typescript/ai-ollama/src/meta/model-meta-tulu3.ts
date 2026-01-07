import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const TULU3_LATEST = {
  name: 'tulu3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const TULU3_8b = {
  name: 'tulu3:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.9gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const TULU3_70b = {
  name: 'tulu3:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '43gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const TULU3_MODELS = [
  TULU3_LATEST.name,
  TULU3_8b.name,
  TULU3_70b.name,
] as const

// const TULU3_IMAGE_MODELS = [] as const

// export const TULU3_EMBEDDING_MODELS = [] as const

// const TULU3_AUDIO_MODELS = [] as const

// const TULU3_VIDEO_MODELS = [] as const

// export type Tulu3ChatModels = (typeof TULU3_MODELS)[number]

// Manual type map for per-model provider options
export type Tulu3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [TULU3_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [TULU3_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [TULU3_70b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Tulu3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [TULU3_LATEST.name]: typeof TULU3_LATEST.supports.input
  [TULU3_8b.name]: typeof TULU3_8b.supports.input
  [TULU3_70b.name]: typeof TULU3_70b.supports.input
}
