import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const QWEN2_5_CODER_LATEST = {
  name: 'qwen2.5-coder:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_5_CODER_0_5b = {
  name: 'qwen2.5-coder:0.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '398mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_5_CODER_1_5b = {
  name: 'qwen2.5-coder:1.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '986mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_5_CODER_3b = {
  name: 'qwen2.5-coder:3b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '1.9gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_5_CODER_7b = {
  name: 'qwen2.5-coder:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '4.7gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_5_CODER_14b = {
  name: 'qwen2.5-coder:14b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '9gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_5_CODER_32b = {
  name: 'qwen2.5-coder:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '20gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const QWEN2_5_CODER_MODELS = [
  QWEN2_5_CODER_LATEST.name,
  QWEN2_5_CODER_0_5b.name,
  QWEN2_5_CODER_1_5b.name,
  QWEN2_5_CODER_3b.name,
  QWEN2_5_CODER_7b.name,
  QWEN2_5_CODER_14b.name,
  QWEN2_5_CODER_32b.name,
] as const

// const QWEN2_5_CODER_IMAGE_MODELS = [] as const

// export const QWEN2_5_CODER_EMBEDDING_MODELS = [] as const

// const QWEN2_5_CODER_AUDIO_MODELS = [] as const

// const QWEN2_5_CODER_VIDEO_MODELS = [] as const

// export type Qwen2_5CoderChatModels = (typeof QWEN2_5_CODER_MODELS)[number]

// Manual type map for per-model provider options
export type Qwen2_5CoderChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [QWEN2_5_CODER_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_CODER_0_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_CODER_1_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_CODER_3b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_CODER_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_CODER_14b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_CODER_32b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Qwen2_5CoderModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [QWEN2_5_CODER_LATEST.name]: typeof QWEN2_5_CODER_LATEST.supports.input
  [QWEN2_5_CODER_0_5b.name]: typeof QWEN2_5_CODER_0_5b.supports.input
  [QWEN2_5_CODER_1_5b.name]: typeof QWEN2_5_CODER_1_5b.supports.input
  [QWEN2_5_CODER_3b.name]: typeof QWEN2_5_CODER_3b.supports.input
  [QWEN2_5_CODER_7b.name]: typeof QWEN2_5_CODER_7b.supports.input
  [QWEN2_5_CODER_14b.name]: typeof QWEN2_5_CODER_14b.supports.input
  [QWEN2_5_CODER_32b.name]: typeof QWEN2_5_CODER_32b.supports.input
}
