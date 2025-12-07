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

const TINNYLLAMA_LATEST = {
  name: 'tinnyllama:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '638mb',
  context: 2_000,
} as const satisfies ModelMeta<any>

const TINNYLLAMA_1_1b = {
  name: 'tinnyllama:1.1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '638mb',
  context: 2_000,
} as const satisfies ModelMeta<any>

export const TINNYLLAMA_MODELS = [
  TINNYLLAMA_LATEST.name,
  TINNYLLAMA_1_1b.name,
] as const

const TINNYLLAMA_IMAGE_MODELS = [] as const

export const TINNYLLAMA_EMBEDDING_MODELS = [] as const

const TINNYLLAMA_AUDIO_MODELS = [] as const

const TINNYLLAMA_VIDEO_MODELS = [] as const

// export type TinnyllamaChatModels = (typeof TINNYLLAMA_MODELS)[number]

// Manual type map for per-model provider options
export type TinnyllamaChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [TINNYLLAMA_LATEST.name]: ChatRequest
  [TINNYLLAMA_1_1b.name]: ChatRequest
}

export type TinnyllamaModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [TINNYLLAMA_LATEST.name]: typeof TINNYLLAMA_LATEST.supports.input
  [TINNYLLAMA_1_1b.name]: typeof TINNYLLAMA_1_1b.supports.input
}
