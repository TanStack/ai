import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaMessageImages,
  OllamaModelMeta,
} from './models-meta'

const MISTRAL_LATEST = {
  name: 'mistral:latest',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '2.9gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

const MISTRAL_7b = {
  name: 'mistral:87',
  supports: {
    input: ['text', 'image'],
    output: ['text'],
    capabilities: ['vision'],
  },
  size: '2.9gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages<OllamaMessageImages>
>

export const MISTRAL_MODELS = [MISTRAL_LATEST.name, MISTRAL_7b.name] as const

// const MISTRAL_IMAGE_MODELS = [] as const

// export const MISTRAL_EMBEDDING_MODELS = [] as const

// const MISTRAL_AUDIO_MODELS = [] as const

// const MISTRAL_VIDEO_MODELS = [] as const

// export type MistralChatModels = (typeof MISTRAL_MODELS)[number]

// Manual type map for per-model provider options
export type MistralChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MISTRAL_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>

  [MISTRAL_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageImages>
}

export type MistralModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MISTRAL_LATEST.name]: typeof MISTRAL_LATEST.supports.input
  [MISTRAL_7b.name]: typeof MISTRAL_7b.supports.input
}
