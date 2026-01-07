import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const PHI4_LATEST = {
  name: 'phi4:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '9.1gb',
  context: 16_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const PHI4_14b = {
  name: 'phi4:14b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '9.1gb',
  context: 16_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const PHI4_MODELS = [PHI4_LATEST.name, PHI4_14b.name] as const

// const PHI4_IMAGE_MODELS = [] as const

// export const PHI4_EMBEDDING_MODELS = [] as const

// const PHI4_AUDIO_MODELS = [] as const

// const PHI4_VIDEO_MODELS = [] as const

// export type Phi4ChatModels = (typeof PHI4_MODELS)[number]

// Manual type map for per-model provider options
export type Phi4ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [PHI4_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [PHI4_14b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Phi4ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [PHI4_LATEST.name]: typeof PHI4_LATEST.supports.input
  [PHI4_14b.name]: typeof PHI4_14b.supports.input
}
