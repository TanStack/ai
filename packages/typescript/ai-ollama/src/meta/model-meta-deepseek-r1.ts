import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestThinking,
  OllamaChatRequestTools,
  OllamaMessageThinking,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const DEEPSEEK_R1_LATEST = {
  name: 'deepseek-r1:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '5.2gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_R1_1_5b = {
  name: 'deepseek-r1:1.5b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '1.1gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_R1_7b = {
  name: 'deepseek-r1:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '4.7gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_R1_8b = {
  name: 'deepseek-r1:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '5.2gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_R1_32b = {
  name: 'deepseek-r1:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '20gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_R1_70b = {
  name: 'deepseek-r1:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '43gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const DEEPSEEK_R1_671b = {
  name: 'deepseek-r1:671b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '404gb',
  context: 160_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

export const DEEPSEEK_R1_MODELS = [
  DEEPSEEK_R1_LATEST.name,
  DEEPSEEK_R1_1_5b.name,
  DEEPSEEK_R1_7b.name,
  DEEPSEEK_R1_8b.name,
  DEEPSEEK_R1_32b.name,
  DEEPSEEK_R1_70b.name,
  DEEPSEEK_R1_671b.name,
] as const

// const DEEPSEEK_R1_IMAGE_MODELS = [] as const

// export const DEEPSEEK_R1_EMBEDDING_MODELS = [] as const

// const DEEPSEEK_R1_AUDIO_MODELS = [] as const

// const DEEPSEEK_R1_VIDEO_MODELS = [] as const

// export type DeepseekChatModels = (typeof DEEPSEEK_R1_MODELS)[number]

// Manual type map for per-model provider options
export type DeepseekR1ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [DEEPSEEK_R1_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_R1_1_5b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_R1_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_R1_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_R1_32b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_R1_70b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [DEEPSEEK_R1_671b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
}

export type DeepseekR1ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [DEEPSEEK_R1_LATEST.name]: typeof DEEPSEEK_R1_LATEST.supports.input
  [DEEPSEEK_R1_1_5b.name]: typeof DEEPSEEK_R1_1_5b.supports.input
  [DEEPSEEK_R1_7b.name]: typeof DEEPSEEK_R1_7b.supports.input
  [DEEPSEEK_R1_8b.name]: typeof DEEPSEEK_R1_8b.supports.input
  [DEEPSEEK_R1_32b.name]: typeof DEEPSEEK_R1_32b.supports.input
  [DEEPSEEK_R1_70b.name]: typeof DEEPSEEK_R1_70b.supports.input
  [DEEPSEEK_R1_671b.name]: typeof DEEPSEEK_R1_671b.supports.input
}
