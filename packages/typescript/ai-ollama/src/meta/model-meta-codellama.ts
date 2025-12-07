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

const CODELLAMA_LATEST = {
  name: 'codellama:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.8gb',
  context: 16_000,
} as const satisfies ModelMeta<any>

const CODELLAMA_7b = {
  name: 'codellama:7b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '3.8gb',
  context: 16_000,
} as const satisfies ModelMeta<any>

const CODELLAMA_13b = {
  name: 'codellama:13b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '7.4gb',
  context: 16_000,
} as const satisfies ModelMeta<any>

const CODELLAMA_34b = {
  name: 'codellama:34b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '19gb',
  context: 16_000,
} as const satisfies ModelMeta<any>

const CODELLAMA_70b = {
  name: 'codellama:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '39gb',
  context: 2_000,
} as const satisfies ModelMeta<any>

export const CODELLAMA_MODELS = [
  CODELLAMA_LATEST.name,
  CODELLAMA_7b.name,
  CODELLAMA_13b.name,
  CODELLAMA_34b.name,
  CODELLAMA_70b.name,
] as const

const CODELLAMA_IMAGE_MODELS = [] as const

export const CODELLAMA_EMBEDDING_MODELS = [] as const

const CODELLAMA_AUDIO_MODELS = [] as const

const CODELLAMA_VIDEO_MODELS = [] as const

// export type CodellamaChatModels = (typeof CODELLAMA_MODELS)[number]

// Manual type map for per-model provider options
export type CodellamaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [CODELLAMA_LATEST.name]: ChatRequest
  [CODELLAMA_7b.name]: ChatRequest
  [CODELLAMA_13b.name]: ChatRequest
  [CODELLAMA_34b.name]: ChatRequest
  [CODELLAMA_70b.name]: ChatRequest
}

export type CodellamaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [CODELLAMA_LATEST.name]: typeof CODELLAMA_LATEST.supports.input
  [CODELLAMA_7b.name]: typeof CODELLAMA_7b.supports.input
  [CODELLAMA_13b.name]: typeof CODELLAMA_13b.supports.input
  [CODELLAMA_34b.name]: typeof CODELLAMA_34b.supports.input
  [CODELLAMA_70b.name]: typeof CODELLAMA_70b.supports.input
}
