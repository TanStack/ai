import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestThinking,
  OllamaChatRequestTools,
  OllamaMessageThinking,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const QWEN3_LATEST = {
  name: 'qwen3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '5.2gb',
  context: 40_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_0_6b = {
  name: 'qwen3:0.6b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '523mb',
  context: 40_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_1_7b = {
  name: 'qwen3:1.7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '1.4gb',
  context: 40_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_4b = {
  name: 'qwen3:4b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '2.5gb',
  context: 256_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_8b = {
  name: 'qwen3:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '5.2gb',
  context: 40_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_14b = {
  name: 'qwen3:14b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '9.3gb',
  context: 40_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_30b = {
  name: 'qwen3:30b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '19gb',
  context: 256_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_32b = {
  name: 'qwen3:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '20gb',
  context: 40_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

const QWEN3_235b = {
  name: 'qwen3:235b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['thinking', 'tools'],
  },
  size: '142gb',
  context: 256_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
>

export const QWEN3_MODELS = [
  QWEN3_LATEST.name,
  QWEN3_0_6b.name,
  QWEN3_1_7b.name,
  QWEN3_4b.name,
  QWEN3_8b.name,
  QWEN3_14b.name,
  QWEN3_30b.name,
  QWEN3_32b.name,
  QWEN3_235b.name,
] as const

// const QWEN3_IMAGE_MODELS = [] as const

// export const QWEN3_EMBEDDING_MODELS = [] as const

// const QWEN3_AUDIO_MODELS = [] as const

// const QWEN3_VIDEO_MODELS = [] as const

// export type Qwen3ChatModels = (typeof QWEN3_MODELS)[number]

// Manual type map for per-model provider options
export type Qwen3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [QWEN3_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_0_6b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_1_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_4b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_8b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_14b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_30b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_32b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
  [QWEN3_235b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking
}

export type Qwen3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [QWEN3_LATEST.name]: typeof QWEN3_LATEST.supports.input
  [QWEN3_0_6b.name]: typeof QWEN3_0_6b.supports.input
  [QWEN3_1_7b.name]: typeof QWEN3_1_7b.supports.input
  [QWEN3_4b.name]: typeof QWEN3_4b.supports.input
  [QWEN3_8b.name]: typeof QWEN3_8b.supports.input
  [QWEN3_14b.name]: typeof QWEN3_14b.supports.input
  [QWEN3_30b.name]: typeof QWEN3_30b.supports.input
  [QWEN3_32b.name]: typeof QWEN3_32b.supports.input
  [QWEN3_235b.name]: typeof QWEN3_235b.supports.input
}
