import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestThinking,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const DEEPSEEK_V3_1_LATEST = {
  name: 'deepseek-v3.1:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '404gb',
  context: 160_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_V3_1_671b = {
  name: 'deepseek-v3.1:671b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },

  size: '404gb',
  context: 160_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_V3_1_671b_cloud = {
  name: 'deepseek-v3.1:671b-cloud',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '404gb',
  context: 160_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

export const DEEPSEEK_V3_1_MODELS = [
  DEEPSEEK_V3_1_LATEST.name,
  DEEPSEEK_V3_1_671b.name,
  DEEPSEEK_V3_1_671b_cloud.name,
] as const

// export const DEEPSEEK_V3_1_IMAGE_MODELS = [] as const

// export const DEEPSEEK_V3_1_EMBEDDING_MODELS = [] as const

// export const DEEPSEEK_V3_1_AUDIO_MODELS = [] as const

// export const DEEPSEEK_V3_1_VIDEO_MODELS = [] as const

// export type DeepseekV3_1ChatModels = (typeof DEEPSEEK_V3_1__MODELS)[number]

// Manual type map for per-model provider options
export type Deepseekv3_1ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [DEEPSEEK_V3_1_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_V3_1_671b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_V3_1_671b_cloud.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
}

export type Deepseekv3_1ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [DEEPSEEK_V3_1_LATEST.name]: typeof DEEPSEEK_V3_1_LATEST.supports.input
  [DEEPSEEK_V3_1_671b.name]: typeof DEEPSEEK_V3_1_671b.supports.input
  [DEEPSEEK_V3_1_671b_cloud.name]: typeof DEEPSEEK_V3_1_671b_cloud.supports.input
}
