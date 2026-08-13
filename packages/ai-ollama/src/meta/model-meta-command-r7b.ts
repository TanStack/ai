import type {
  OllamaChatRequest,
  OllamaChatRequestMessages,
  OllamaChatRequestTools,
  OllamaMessageTools,
  OllamaModelMeta,
} from './models-meta'

const COMMAND_R_7b_LATEST = {
  name: 'command-r7b:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '5.1gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

const COMMAND_R_7b_7b = {
  name: 'command-r7b:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '5.1gb',
  context: 8_000,
} as const satisfies OllamaModelMeta<
  OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
>

export const COMMAND_R_7b_MODELS = [
  COMMAND_R_7b_LATEST.name,
  COMMAND_R_7b_7b.name,
] as const

// const COMMAND_R_7b_IMAGE_MODELS = [] as const

// export const COMMAND_R_7b_EMBEDDING_MODELS = [] as const

// const COMMAND_R_7b_AUDIO_MODELS = [] as const

// const COMMAND_R_7b_VIDEO_MODELS = [] as const

// export type CommandRChatModels = (typeof COMMAND_R7b_MODELS)[number]

// Manual type map for per-model provider options
export type CommandR7bChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [COMMAND_R_7b_LATEST.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
  [COMMAND_R_7b_7b.name]: OllamaChatRequest &
    OllamaChatRequestMessages<OllamaMessageTools> &
    OllamaChatRequestTools
}

export type CommandR7bModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [COMMAND_R_7b_LATEST.name]: typeof COMMAND_R_7b_LATEST.supports.input
  [COMMAND_R_7b_7b.name]: typeof COMMAND_R_7b_7b.supports.input
}
