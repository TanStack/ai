import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const LLAMA3_CHATQA_LATEST = {
  name: 'llama3-chatqa:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA3_CHATQA_8b = {
  name: 'llama3-chatqa:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const LLAMA3_CHATQA_70b = {
  name: 'llama3-chatqa:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '40gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const LLAMA3_CHATQA_MODELS = [
  LLAMA3_CHATQA_LATEST.name,
  LLAMA3_CHATQA_8b.name,
  LLAMA3_CHATQA_70b.name,
] as const

// const LLAMA3_CHATQA_IMAGE_MODELS = [] as const

// export const LLAMA3_CHATQA_EMBEDDING_MODELS = [] as const

// const LLAMA3_CHATQA_AUDIO_MODELS = [] as const

// const LLAMA3_CHATQA_VIDEO_MODELS = [] as const

// export type Llama3ChatQaChatModels = (typeof LLAMA3_CHATQA_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3ChatQaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_CHATQA_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA3_CHATQA_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [LLAMA3_CHATQA_70b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type Llama3ChatQaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_CHATQA_LATEST.name]: typeof LLAMA3_CHATQA_LATEST.supports.input
  [LLAMA3_CHATQA_8b.name]: typeof LLAMA3_CHATQA_8b.supports.input
  [LLAMA3_CHATQA_70b.name]: typeof LLAMA3_CHATQA_70b.supports.input
}
