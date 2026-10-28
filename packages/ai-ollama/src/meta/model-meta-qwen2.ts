import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const QWEN2_LATEST = {
  name: 'qwen2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '4.4gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_0_5b = {
  name: 'qwen2:0.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '352mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_1_5b = {
  name: 'qwen2:1.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '935mb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_7b = {
  name: 'qwen2:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '4.4gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const QWEN2_72b = {
  name: 'qwen2:72b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '41gb',
  context: 32_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const QWEN2_MODELS = [
  QWEN2_LATEST.name,
  QWEN2_0_5b.name,
  QWEN2_1_5b.name,
  QWEN2_7b.name,
  QWEN2_72b.name,
] as const

// const QWEN2_IMAGE_MODELS = [] as const

// export const QWEN2_EMBEDDING_MODELS = [] as const

// const QWEN2_AUDIO_MODELS = [] as const

// const QWEN2_VIDEO_MODELS = [] as const

// export type Qwen2ChatModels = (typeof QWEN2_MODELS)[number]

// Manual type map for per-model provider options
export type Qwen2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [QWEN2_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_0_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_1_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [QWEN2_72b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type Qwen2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [QWEN2_LATEST.name]: typeof QWEN2_LATEST.supports.input
  [QWEN2_0_5b.name]: typeof QWEN2_0_5b.supports.input
  [QWEN2_1_5b.name]: typeof QWEN2_1_5b.supports.input
  [QWEN2_7b.name]: typeof QWEN2_7b.supports.input
  [QWEN2_72b.name]: typeof QWEN2_72b.supports.input
}
