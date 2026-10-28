import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const SMOLLM_LATEST = {
  name: 'smollm:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '991mb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const SMOLLM_135m = {
  name: 'smollm:135m',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '92mb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const SMOLLM_360m = {
  name: 'smollm:360m',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '229mb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const SMOLLM_1_7b = {
  name: 'smollm:1.7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '991mb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const SMOLLM_MODELS = [
  SMOLLM_LATEST.name,
  SMOLLM_135m.name,
  SMOLLM_360m.name,
  SMOLLM_1_7b.name,
] as const

// const SMOLLM_IMAGE_MODELS = [] as const

// export const SMOLLM_EMBEDDING_MODELS = [] as const

// const SMOLLM_AUDIO_MODELS = [] as const

// const SMOLLM_VIDEO_MODELS = [] as const

// export type SmollmChatModels = (typeof SMOLLM_MODELS)[number]

// Manual type map for per-model provider options
export type SmollmChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [SMOLLM_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [SMOLLM_135m.name]: OllamaChatRequest & OllamaChatRequestMessages
  [SMOLLM_360m.name]: OllamaChatRequest & OllamaChatRequestMessages
  [SMOLLM_1_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type SmollmModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [SMOLLM_LATEST.name]: typeof SMOLLM_LATEST.supports.input
  [SMOLLM_135m.name]: typeof SMOLLM_135m.supports.input
  [SMOLLM_360m.name]: typeof SMOLLM_360m.supports.input
  [SMOLLM_1_7b.name]: typeof SMOLLM_1_7b.supports.input
}
