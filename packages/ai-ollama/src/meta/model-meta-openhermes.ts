import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const OPENHERMES_LATEST = {
  name: 'openhermes:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.1gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const OPENHERMES_V2 = {
  name: 'openhermes:v2',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.1gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const OPENHERMES_V2_5 = {
  name: 'openhermes:v2.5',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.1gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const OPENHERMES_MODELS = [
  OPENHERMES_LATEST.name,
  OPENHERMES_V2.name,
  OPENHERMES_V2_5.name,
] as const

// const OPENHERMES_IMAGE_MODELS = [] as const

// export const OPENHERMES_EMBEDDING_MODELS = [] as const

// const OPENHERMES_AUDIO_MODELS = [] as const

// const OPENHERMES_VIDEO_MODELS = [] as const

// export type OpenhermesChatModels = (typeof OPENHERMES_MODELS)[number]

// Manual type map for per-model provider options
export type OpenhermesChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [OPENHERMES_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [OPENHERMES_V2.name]: OllamaChatRequest & OllamaChatRequestMessages
  [OPENHERMES_V2_5.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type OpenhermesModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [OPENHERMES_LATEST.name]: typeof OPENHERMES_LATEST.supports.input
  [OPENHERMES_V2.name]: typeof OPENHERMES_V2.supports.input
  [OPENHERMES_V2_5.name]: typeof OPENHERMES_V2_5.supports.input
}
