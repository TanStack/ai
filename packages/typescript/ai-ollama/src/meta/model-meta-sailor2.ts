import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const SAILOR2_LATEST = {
  name: 'sailor2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.2gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const SAILOR2_1b = {
  name: 'sailor2:1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.1gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const SAILOR2_8b = {
  name: 'sailor2:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.2gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>
const SAILOR2_20b = {
  name: 'sailor2:20b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '12gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const SAILOR2_MODELS = [
  SAILOR2_LATEST.name,
  SAILOR2_8b.name,
  SAILOR2_20b.name,
] as const

// const SAILOR2_IMAGE_MODELS = [] as const

// export const SAILOR2_EMBEDDING_MODELS = [] as const

// const SAILOR2_AUDIO_MODELS = [] as const

// const SAILOR2_VIDEO_MODELS = [] as const

// export type Sailor2ChatModels = (typeof SAILOR2_MODELS)[number]

// Manual type map for per-model provider options
export type Sailor2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [SAILOR2_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [SAILOR2_1b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [SAILOR2_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [SAILOR2_20b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Sailor2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [SAILOR2_LATEST.name]: typeof SAILOR2_LATEST.supports.input
  [SAILOR2_1b.name]: typeof SAILOR2_1b.supports.input
  [SAILOR2_8b.name]: typeof SAILOR2_8b.supports.input
  [SAILOR2_20b.name]: typeof SAILOR2_20b.supports.input
}
