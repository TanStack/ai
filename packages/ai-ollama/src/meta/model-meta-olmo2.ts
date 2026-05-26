import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const OLMO2_LATEST = {
  name: 'olmo2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.5gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const OLMO2_7b = {
  name: 'olmo2:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.5gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const OLMO2_13b = {
  name: 'olmo2:13b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '8.4gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const OLMO2_MODELS = [
  OLMO2_LATEST.name,
  OLMO2_7b.name,
  OLMO2_13b.name,
] as const

// const OLMO2_IMAGE_MODELS = [] as const

// export const OLMO2_EMBEDDING_MODELS = [] as const

// const OLMO2_AUDIO_MODELS = [] as const

// const OLMO2_VIDEO_MODELS = [] as const

// export type Olmo2ChatModels = (typeof OLMO2_MODELS)[number]

// Manual type map for per-model provider options
export type Olmo2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [OLMO2_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [OLMO2_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [OLMO2_13b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Olmo2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [OLMO2_LATEST.name]: typeof OLMO2_LATEST.supports.input
  [OLMO2_7b.name]: typeof OLMO2_7b.supports.input
  [OLMO2_13b.name]: typeof OLMO2_13b.supports.input
}
