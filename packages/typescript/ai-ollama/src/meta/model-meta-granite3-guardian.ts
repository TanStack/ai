import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const GRANITE3_GUARDIAN_LATEST = {
  name: 'granite3-guardian:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GRANITE3_GUARDIAN_2b = {
  name: 'granite3-guardian:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const GRANITE3_GUARDIAN_8b = {
  name: 'granite3-guardian:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.8gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const GRANITE3_GUARDIAN_MODELS = [
  GRANITE3_GUARDIAN_LATEST.name,
  GRANITE3_GUARDIAN_2b.name,
  GRANITE3_GUARDIAN_8b.name,
] as const

// const GRANITE3_GUARDIAN_IMAGE_MODELS = [] as const

// export const GRANITE3_GUARDIAN_EMBEDDING_MODELS = [] as const

// const GRANITE3_GUARDIAN_AUDIO_MODELS = [] as const

// const GRANITE3_GUARDIAN_VIDEO_MODELS = [] as const

// export type GraniteGuardian3ChatModels = (typeof GRANITE3_GUARDIAN_MODELS)[number]

// Manual type map for per-model provider options
export type Granite3GuardianChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GRANITE3_GUARDIAN_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GRANITE3_GUARDIAN_2b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [GRANITE3_GUARDIAN_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Granite3GuardianModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GRANITE3_GUARDIAN_LATEST.name]: typeof GRANITE3_GUARDIAN_LATEST.supports.input
  [GRANITE3_GUARDIAN_2b.name]: typeof GRANITE3_GUARDIAN_2b.supports.input
  [GRANITE3_GUARDIAN_8b.name]: typeof GRANITE3_GUARDIAN_8b.supports.input
}
