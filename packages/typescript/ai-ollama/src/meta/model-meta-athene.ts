import type { ChatRequest } from 'ollama'
import type { DefaultOllamaModelMeta } from './models-meta'

const ATHENE_V2_LATEST = {
  name: 'athene-v2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '47gb',
  context: 32_000,
} as const satisfies DefaultOllamaModelMeta<any>

const ATHENE_V2_72b = {
  name: 'athene-v2:72b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '47gb',
  context: 32_000,
} as const satisfies DefaultOllamaModelMeta<any>

export const ATHENE_MODELS = [
  ATHENE_V2_LATEST.name,
  ATHENE_V2_72b.name,
] as const

// const ATHENE_IMAGE_MODELS = [] as const

// export const ATHENE_EMBEDDING_MODELS = [] as const

// const ATHENE_AUDIO_MODELS = [] as const

// const ATHENE_VIDEO_MODELS = [] as const

// export type AtheneChatModels = (typeof ATHENE_MODELS)[number]

// Manual type map for per-model provider options
export type AtheneChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [ATHENE_V2_LATEST.name]: ChatRequest
  [ATHENE_V2_72b.name]: ChatRequest
}

export type AtheneModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [ATHENE_V2_LATEST.name]: typeof ATHENE_V2_LATEST.supports.input
  [ATHENE_V2_72b.name]: typeof ATHENE_V2_72b.supports.input
}
