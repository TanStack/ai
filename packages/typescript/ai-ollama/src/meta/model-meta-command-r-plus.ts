import type { ChatRequest } from 'ollama'
import type { DefaultOllamaModelMeta } from './models-meta'

const COMMAND_R_PLUS_LATEST = {
  name: 'command-r-plus:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '59gb',
  context: 128_000,
} as const satisfies DefaultOllamaModelMeta<any>

const COMMAND_R_PLUS_104b = {
  name: 'command-r-plus:104b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '59gb',
  context: 128_000,
} as const satisfies DefaultOllamaModelMeta<any>

export const COMMAND_R_PLUS_MODELS = [
  COMMAND_R_PLUS_LATEST.name,
  COMMAND_R_PLUS_104b.name,
] as const

// const COMMAND_R_PLUS_IMAGE_MODELS = [] as const

// export const COMMAND_R_PLUS_EMBEDDING_MODELS = [] as const

// const COMMAND_R_PLUS_AUDIO_MODELS = [] as const

// const COMMAND_R_PLUS_VIDEO_MODELS = [] as const

// export type CommandRChatModels = (typeof COMMAND_R_PLUS_MODELS)[number]

// Manual type map for per-model provider options
export type CommandRPlusChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [COMMAND_R_PLUS_LATEST.name]: ChatRequest
  [COMMAND_R_PLUS_104b.name]: ChatRequest
}

export type CommandRPlusModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [COMMAND_R_PLUS_LATEST.name]: typeof COMMAND_R_PLUS_LATEST.supports.input
  [COMMAND_R_PLUS_104b.name]: typeof COMMAND_R_PLUS_104b.supports.input
}
