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

const GEMMA2_LATEST = {
  name: 'gemma2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.4gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const GEMMA2_2b = {
  name: 'gemma2:2b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const GEMMA2_9b = {
  name: 'gemma2:9b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '5.4gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const GEMMA2_27b = {
  name: 'gemma2:27b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '16gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

export const GEMMA2_MODELS = [
  GEMMA2_LATEST.name,
  GEMMA2_2b.name,
  GEMMA2_9b.name,
  GEMMA2_27b.name,
] as const

const GEMMA2_IMAGE_MODELS = [] as const

export const GEMMA2_EMBEDDING_MODELS = [] as const

const GEMMA2_AUDIO_MODELS = [] as const

const GEMMA2_VIDEO_MODELS = [] as const

// export type Gemma2ChatModels = (typeof GEMMA2_MODELS)[number]

// Manual type map for per-model provider options
export type Gemma2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [GEMMA2_LATEST.name]: ChatRequest
  [GEMMA2_2b.name]: ChatRequest
  [GEMMA2_9b.name]: ChatRequest
  [GEMMA2_27b.name]: ChatRequest
}

export type Gemma2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [GEMMA2_LATEST.name]: typeof GEMMA2_LATEST.supports.input
  [GEMMA2_2b.name]: typeof GEMMA2_2b.supports.input
  [GEMMA2_9b.name]: typeof GEMMA2_9b.supports.input
  [GEMMA2_27b.name]: typeof GEMMA2_27b.supports.input
}
