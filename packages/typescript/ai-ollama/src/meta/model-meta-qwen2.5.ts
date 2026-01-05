import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const QWEN2_5_LATEST = {
  name: 'qwen2.5:latest',
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

const QWEN2_5_0_5b = {
  name: 'qwen2.5:0.5b',
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

const QWEN2_5_1_5b = {
  name: 'qwen2.5:1.5b',
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

const QWEN2_5_3b = {
  name: 'qwen2.5:3b',
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

const QWEN2_5_7b = {
  name: 'qwen2.5:7b',
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

const QWEN2_5_14b = {
  name: 'qwen2.5:14b',
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

const QWEN2_5_32b = {
  name: 'qwen2.5:32b',
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

const QWEN2_5_72b = {
  name: 'qwen2.5:72b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '47gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const QWEN2_5_MODELS = [
  QWEN2_5_LATEST.name,
  QWEN2_5_0_5b.name,
  QWEN2_5_1_5b.name,
  QWEN2_5_3b.name,
  QWEN2_5_7b.name,
  QWEN2_5_32b.name,
  QWEN2_5_72b.name,
] as const

// const QWEN2_5_IMAGE_MODELS = [] as const

// export const QWEN2_5_EMBEDDING_MODELS = [] as const

// const QWEN2_5_AUDIO_MODELS = [] as const

// const QWEN2_5_VIDEO_MODELS = [] as const

// export type Qwen2_5ChatModels = (typeof QWEN2_5_MODELS)[number]

// Manual type map for per-model provider options
export type Qwen2_5ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [QWEN2_5_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_0_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_1_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_3b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_14b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_32b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_5_72b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Qwen2_5ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [QWEN2_5_LATEST.name]: typeof QWEN2_5_LATEST.supports.input
  [QWEN2_5_0_5b.name]: typeof QWEN2_5_0_5b.supports.input
  [QWEN2_5_1_5b.name]: typeof QWEN2_5_1_5b.supports.input
  [QWEN2_5_3b.name]: typeof QWEN2_5_3b.supports.input
  [QWEN2_5_7b.name]: typeof QWEN2_5_7b.supports.input
  [QWEN2_5_14b.name]: typeof QWEN2_5_7b.supports.input
  [QWEN2_5_32b.name]: typeof QWEN2_5_32b.supports.input
  [QWEN2_5_72b.name]: typeof QWEN2_5_72b.supports.input
}
