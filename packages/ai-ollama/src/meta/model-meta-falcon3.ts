import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const FALCON3_LATEST = {
  name: 'falcon3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.6gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const FALCON3_1b = {
  name: 'falcon3:1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.8gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const FALCON3_3b = {
  name: 'falcon3:3b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const FALCON3_7b = {
  name: 'falcon3:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.6gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const FALCON3_10b = {
  name: 'falcon3:10b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '6.3gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const FALCON3_MODELS = [
  FALCON3_LATEST.name,
  FALCON3_1b.name,
  FALCON3_3b.name,
  FALCON3_7b.name,
  FALCON3_10b.name,
] as const

// const FALCON3_IMAGE_MODELS = [] as const

// export const FALCON3_EMBEDDING_MODELS = [] as const

// const FALCON3_AUDIO_MODELS = [] as const

// const FALCON3_VIDEO_MODELS = [] as const

// export type Falcon3ChatModels = (typeof FALCON3_MODELS)[number]

// Manual type map for per-model provider options
export type Falcon3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [FALCON3_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [FALCON3_1b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [FALCON3_3b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [FALCON3_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [FALCON3_10b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Falcon3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [FALCON3_LATEST.name]: typeof FALCON3_LATEST.supports.input
  [FALCON3_1b.name]: typeof FALCON3_1b.supports.input
  [FALCON3_3b.name]: typeof FALCON3_3b.supports.input
  [FALCON3_7b.name]: typeof FALCON3_7b.supports.input
  [FALCON3_10b.name]: typeof FALCON3_10b.supports.input
}
