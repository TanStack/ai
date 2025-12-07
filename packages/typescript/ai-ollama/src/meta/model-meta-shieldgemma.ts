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

const SHIELDGEMMA_LATEST = {
  name: 'shieldgemma:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.8gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const SHIELDGEMMA_2b = {
  name: 'shieldgemma:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.7gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const SHIELDGEMMA_9b = {
  name: 'shieldgemma:9b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.8gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const SHIELDGEMMA_27b = {
  name: 'shieldgemma:27b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '17gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

export const SHIELDGEMMA_MODELS = [
  SHIELDGEMMA_LATEST.name,
  SHIELDGEMMA_2b.name,
  SHIELDGEMMA_9b.name,
  SHIELDGEMMA_27b.name,
] as const

const SHIELDGEMMA_IMAGE_MODELS = [] as const

export const SHIELDGEMMA_EMBEDDING_MODELS = [] as const

const SHIELDGEMMA_AUDIO_MODELS = [] as const

const SHIELDGEMMA_VIDEO_MODELS = [] as const

// export type ShieldgemmaChatModels = (typeof SHIELDGEMMA_MODELS)[number]

// Manual type map for per-model provider options
export type ShieldgemmaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [SHIELDGEMMA_LATEST.name]: ChatRequest
  [SHIELDGEMMA_2b.name]: ChatRequest
  [SHIELDGEMMA_9b.name]: ChatRequest
  [SHIELDGEMMA_27b.name]: ChatRequest
}

export type ShieldgemmaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [SHIELDGEMMA_LATEST.name]: typeof SHIELDGEMMA_LATEST.supports.input
  [SHIELDGEMMA_2b.name]: typeof SHIELDGEMMA_2b.supports.input
  [SHIELDGEMMA_9b.name]: typeof SHIELDGEMMA_9b.supports.input
  [SHIELDGEMMA_27b.name]: typeof SHIELDGEMMA_27b.supports.input
}
