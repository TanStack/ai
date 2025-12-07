import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const FALCON2_LATEST = {
  name: 'falcon2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '6.4gb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const FALCON2_11b = {
  name: 'falcon2:11b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '6.4gb',
  context: 2_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const FALCON2_MODELS = [FALCON2_LATEST.name, FALCON2_11b.name] as const

// const FALCON2_IMAGE_MODELS = [] as const

// export const FALCON2_EMBEDDING_MODELS = [] as const

// const FALCON2_AUDIO_MODELS = [] as const

// const FALCON2_VIDEO_MODELS = [] as const

// export type Falcon2ChatModels = (typeof FALCON2_MODELS)[number]

// Manual type map for per-model provider options
export type Falcon2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [FALCON2_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [FALCON2_11b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Falcon2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [FALCON2_LATEST.name]: typeof FALCON2_LATEST.supports.input
  [FALCON2_11b.name]: typeof FALCON2_11b.supports.input
}
