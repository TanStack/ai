import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const MARCO_O1_LATEST = {
  name: 'marco-o1:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const MARCO_O1_7b = {
  name: 'marco-o1:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const MARCO_O1_MODELS = [MARCO_O1_LATEST.name, MARCO_O1_7b.name] as const

// const MARCO_O1_IMAGE_MODELS = [] as const

// export const MARCO_O1_EMBEDDING_MODELS = [] as const

// const MARCO_O1_AUDIO_MODELS = [] as const

// const MARCO_O1_VIDEO_MODELS = [] as const

// export type MarcoO1ChatModels = (typeof MARCO_O1_MODELS)[number]

// Manual type map for per-model provider options
export type MarcoO1ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MARCO_O1_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [MARCO_O1_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type MarcoO1ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MARCO_O1_LATEST.name]: typeof MARCO_O1_LATEST.supports.input
  [MARCO_O1_7b.name]: typeof MARCO_O1_7b.supports.input
}
