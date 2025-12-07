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

const LLAMA3_2_LATEST = {
  name: 'llama3.2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '2b',
  context: 128_000,
} as const satisfies ModelMeta<any>

const LLAMA3_2_1b = {
  name: 'llama3.2:1b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '1.3gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const LLAMA3_2_3b = {
  name: 'llama3.2:3b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '2gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

export const LLAMA3_2_MODELS = [
  LLAMA3_2_LATEST.name,
  LLAMA3_2_1b.name,
  LLAMA3_2_3b.name,
] as const

const LLAMA3_2_IMAGE_MODELS = [] as const

export const LLAMA3_2_EMBEDDING_MODELS = [] as const

const LLAMA3_2_AUDIO_MODELS = [] as const

const LLAMA3_2_VIDEO_MODELS = [] as const

// export type Llama3_2ChatModels = (typeof LLAMA3_2_MODELS)[number]

// Manual type map for per-model provider options
export type Llama3_2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [LLAMA3_2_LATEST.name]: ChatRequest
  [LLAMA3_2_1b.name]: ChatRequest
  [LLAMA3_2_3b.name]: ChatRequest
}

export type Llama3_2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [LLAMA3_2_LATEST.name]: typeof LLAMA3_2_LATEST.supports.input
  [LLAMA3_2_1b.name]: typeof LLAMA3_2_1b.supports.input
  [LLAMA3_2_3b.name]: typeof LLAMA3_2_3b.supports.input
}
