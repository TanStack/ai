import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const COMMAND_R_LATEST = {
  name: 'command-r:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '19gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const COMMAND_R_35b = {
  name: 'command-r:35b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '19gb',
  context: 128_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const COMMAND_R_MODELS = [
  COMMAND_R_LATEST.name,
  COMMAND_R_35b.name,
] as const

// const COMMAND_R_IMAGE_MODELS = [] as const

// export const COMMAND_R_EMBEDDING_MODELS = [] as const

// const COMMAND_R_AUDIO_MODELS = [] as const

// const COMMAND_R_VIDEO_MODELS = [] as const

// export type CommandRChatModels = (typeof COMMAND_R_MODELS)[number]

// Manual type map for per-model provider options
export type CommandRChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [COMMAND_R_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [COMMAND_R_35b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type CommandRModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [COMMAND_R_LATEST.name]: typeof COMMAND_R_LATEST.supports.input
  [COMMAND_R_35b.name]: typeof COMMAND_R_35b.supports.input
}
