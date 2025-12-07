import type { ChatRequest } from 'ollama'

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  providerOptions?: TProviderOptions
  supports?: {
    input?: Array<'text' | 'image' | 'video'>
    output?: Array<'text' | 'image' | 'video'>
    capabilities?: Array<'tools' | 'thinking' | 'vision' | 'embedding'>
  }
  size?: string
  context?: number
}

const SMALLTINKER_LATEST = {
  name: 'smalltinker:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.6gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const SMALLTINKER_3b = {
  name: 'smalltinker:3b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.6gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

export const SMALLTINKER_MODELS = [
  SMALLTINKER_LATEST.name,
  SMALLTINKER_3b.name,
] as const

const SMALLTINKER_IMAGE_MODELS = [] as const

export const SMALLTINKER_EMBEDDING_MODELS = [] as const

const SMALLTINKER_AUDIO_MODELS = [] as const

const SMALLTINKER_VIDEO_MODELS = [] as const

// export type SmalltinkerChatModels = (typeof SMALLTINKER_MODELS)[number]

// Manual type map for per-model provider options
export type SmalltinkerChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [SMALLTINKER_LATEST.name]: ChatRequest
  [SMALLTINKER_3b.name]: ChatRequest
}

export type SmalltinkerModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [SMALLTINKER_LATEST.name]: typeof SMALLTINKER_LATEST.supports.input
  [SMALLTINKER_3b.name]: typeof SMALLTINKER_3b.supports.input
}
