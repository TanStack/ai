import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestThinking_OpenAI,
  OllamaChatRequestTools,
  OllamaMessageThinking,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const OPT_OSS_LATEST = {
  name: 'gpt-oss:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '14gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking_OpenAI
>

const OPT_OSS_20b = {
  name: 'gpt-oss:20b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '14gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking_OpenAI
>

const OPT_OSS_120b = {
  name: 'gpt-oss:120b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools', 'thinking'],
  },
  size: '65gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking_OpenAI
>

export const GPT_OSS_MODELS = [
  OPT_OSS_LATEST.name,
  OPT_OSS_20b.name,
  OPT_OSS_120b.name,
] as const

// const GPT_OSS_IMAGE_MODELS = [] as const

// export const GPT_OSS_EMBEDDING_MODELS = [] as const

// const GPT_OSS_AUDIO_MODELS = [] as const

// const GPT_OSS_VIDEO_MODELS = [] as const

// export type GptOssChatModels = (typeof GPT_OSS_MODELS)[number]

// Manual type map for per-model provider options
export type GptOssChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [OPT_OSS_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking_OpenAI
  [OPT_OSS_20b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking_OpenAI
  [OPT_OSS_120b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools & OllamaMessageThinking> &
    OllamaChatRequestTools &
    OllamaChatRequestThinking_OpenAI
}

export type GptOssModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [OPT_OSS_LATEST.name]: typeof OPT_OSS_LATEST.supports.input
  [OPT_OSS_20b.name]: typeof OPT_OSS_20b.supports.input
  [OPT_OSS_120b.name]: typeof OPT_OSS_120b.supports.input
}
