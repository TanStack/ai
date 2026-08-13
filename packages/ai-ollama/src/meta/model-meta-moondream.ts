import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaMessageImages,
  OllamaModelMeta,
} from './models-meta'

const MOONDREAM_LATEST = {
  name: 'moondream:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '1.7gb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const MOONDREAM_1_8b = {
  name: 'moondream:1.8b',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '1.7gb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

export const MOONDREAM_MODELS = [
  MOONDREAM_LATEST.name,
  MOONDREAM_1_8b.name,
] as const

// const MOONDREAM_IMAGE_MODELS = [] as const

// export const MOONDREAM_EMBEDDING_MODELS = [] as const

// const MOONDREAM_AUDIO_MODELS = [] as const

// const MOONDREAM_VIDEO_MODELS = [] as const

// export type MoondreamChatModels = (typeof MOONDREAM_MODELS)[number]

// Manual type map for per-model provider options
export type MoondreamChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MOONDREAM_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
  [MOONDREAM_1_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
}

export type MoondreamModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MOONDREAM_LATEST.name]: typeof MOONDREAM_LATEST.supports.input
  [MOONDREAM_1_8b.name]: typeof MOONDREAM_1_8b.supports.input
}
