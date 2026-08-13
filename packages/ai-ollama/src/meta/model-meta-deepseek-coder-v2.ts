import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaModelMeta,
} from './models-meta'

const DEEPSEEK_CODER_V2_LATEST = {
  name: 'deepseek-coder-v2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '8.9gb',
  context: 160_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const DEEPSEEK_CODER_V2_16b = {
  name: 'deepseek-coder-v2:16b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '8.9gb',
  context: 160_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

const DEEPSEEK_CODER_V2_236b = {
  name: 'deepseek-coder-v2:236b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '133gb',
  context: 4_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest & OllamaChatRequestMessages
>

export const DEEPSEEK_CODER_V2_MODELS = [
  DEEPSEEK_CODER_V2_LATEST.name,
  DEEPSEEK_CODER_V2_16b.name,
  DEEPSEEK_CODER_V2_236b.name,
] as const

// const DEEPSEEK_CODER_V2_IMAGE_MODELS = [] as const

// export const DEEPSEEK_CODER_V2_EMBEDDING_MODELS = [] as const

// const DEEPSEEK_CODER_V2_AUDIO_MODELS = [] as const

// const DEEPSEEK_CODER_V2_VIDEO_MODELS = [] as const

// export type DeepseekCoderV2ChatModels = (typeof DEEPSEEK_CODER_V2_MODELS)[number]

// Manual type map for per-model provider options
export type DeepseekCoderV2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [DEEPSEEK_CODER_V2_LATEST.name]: OllamaChatRequest & OllamaChatRequestMessages
  [DEEPSEEK_CODER_V2_16b.name]: OllamaChatRequest & OllamaChatRequestMessages
  [DEEPSEEK_CODER_V2_236b.name]: OllamaChatRequest & OllamaChatRequestMessages
}

export type DeepseekCoderV2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [DEEPSEEK_CODER_V2_LATEST.name]: typeof DEEPSEEK_CODER_V2_LATEST.supports.input
  [DEEPSEEK_CODER_V2_16b.name]: typeof DEEPSEEK_CODER_V2_16b.supports.input
  [DEEPSEEK_CODER_V2_236b.name]: typeof DEEPSEEK_CODER_V2_236b.supports.input
}
