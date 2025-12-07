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

const LLAMA3_GRADIENT_LATEST = {
  name: 'llama3-gradient:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7b',
  context: 1_000_000,
} as const satisfies ModelMeta<any>

const LLAMA3_GRADIENT_8b = {
  name: 'llama3-gradient:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.7gb',
  context: 1_000_000,
} as const satisfies ModelMeta<any>

const LLAMA3_GRADIENT_70b = {
  name: 'llama3-gradient:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '40gb',
  context: 1_000_000,
} as const satisfies ModelMeta<any>

export const LLAMA3_GRADIENT_MODELS = [
  LLAMA3_GRADIENT_LATEST.name,
  LLAMA3_GRADIENT_8b.name,
  LLAMA3_GRADIENT_70b.name,
] as const

const LLAMA3_GRADIENT_IMAGE_MODELS = [] as const

export const LLAMA3_GRADIENT_EMBEDDING_MODELS = [] as const

const LLAMA3_GRADIENT_AUDIO_MODELS = [] as const

const LLAMA3_GRADIENT_VIDEO_MODELS = [] as const

// export type Llama3GradientChatModels = (typeof LLAMA3_GRADIENT_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3GradientChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_GRADIENT_LATEST.name]: ChatRequest
  [LLAMA3_GRADIENT_8b.name]: ChatRequest
  [LLAMA3_GRADIENT_70b.name]: ChatRequest
}

export type Llama3GradientModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_GRADIENT_LATEST.name]: typeof LLAMA3_GRADIENT_LATEST.supports.input
  [LLAMA3_GRADIENT_8b.name]: typeof LLAMA3_GRADIENT_8b.supports.input
  [LLAMA3_GRADIENT_70b.name]: typeof LLAMA3_GRADIENT_70b.supports.input
}
