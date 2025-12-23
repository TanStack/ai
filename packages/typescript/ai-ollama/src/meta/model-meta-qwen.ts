import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const QWEN_LATEST = {
  name: 'qwen:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2.3gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_0_5b = {
  name: 'qwen:0.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '395mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_1_8b = {
  name: 'qwen:1.8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.1gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_4b = {
  name: 'qwen:4b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2.3gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_7b = {
  name: 'qwen:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.5gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_14b = {
  name: 'qwen:14b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '8.2gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_32b = {
  name: 'qwen:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '18gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_72b = {
  name: 'qwen:72b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '41gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const QWEN_110b = {
  name: 'qwen:110b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '63gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const QWEN_MODELS = [
  QWEN_LATEST.name,
  QWEN_0_5b.name,
  QWEN_1_8b.name,
  QWEN_4b.name,
  QWEN_7b.name,
  QWEN_14b.name,
  QWEN_32b.name,
  QWEN_72b.name,
  QWEN_110b.name,
] as const

// const QWEN_IMAGE_MODELS = [] as const

// export const QWEN_EMBEDDING_MODELS = [] as const

// const QWEN_AUDIO_MODELS = [] as const

// const QWEN_VIDEO_MODELS = [] as const

// export type QwenChatModels = (typeof QWEN_MODELS)[number]

// Manual type map for per-model provider options
export type QwenChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [QWEN_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_0_5b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_1_8b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_4b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_7b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_14b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_32b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_72b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [QWEN_110b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type QwenModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [QWEN_LATEST.name]: typeof QWEN_LATEST.supports.input
  [QWEN_0_5b.name]: typeof QWEN_0_5b.supports.input
  [QWEN_1_8b.name]: typeof QWEN_1_8b.supports.input
  [QWEN_4b.name]: typeof QWEN_4b.supports.input
  [QWEN_7b.name]: typeof QWEN_7b.supports.input
  [QWEN_14b.name]: typeof QWEN_14b.supports.input
  [QWEN_32b.name]: typeof QWEN_32b.supports.input
  [QWEN_72b.name]: typeof QWEN_72b.supports.input
  [QWEN_110b.name]: typeof QWEN_110b.supports.input
}
