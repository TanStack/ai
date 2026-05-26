import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const AYA_LATEST = {
  name: 'aya:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.8gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const AYA_8b = {
  name: 'aya:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.8gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const AYA_35b = {
  name: 'aya:35b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '20gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const AYA_MODELS = [AYA_LATEST.name, AYA_8b.name, AYA_35b.name] as const

// const AYA_IMAGE_MODELS = [] as const

// export const AYA_EMBEDDING_MODELS = [] as const

// const AYA_AUDIO_MODELS = [] as const

// const AYA_VIDEO_MODELS = [] as const

// export type AyaChatModels = (typeof AYA_MODELS)[number]

// Manual type map for per-model provider options
export type AyaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [AYA_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [AYA_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [AYA_35b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type AyaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [AYA_LATEST.name]: typeof AYA_LATEST.supports.input
  [AYA_8b.name]: typeof AYA_8b.supports.input
  [AYA_35b.name]: typeof AYA_35b.supports.input
}
