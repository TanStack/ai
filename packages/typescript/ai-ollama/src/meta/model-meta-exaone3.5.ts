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

const EXAONE3_5_LATEST = {
  name: 'exaone3.5:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.8gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const EXAONE3_5_2_4b = {
  name: 'exaone3.5:2.4b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '1.6gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const EXAONE3_5_7_1b = {
  name: 'exaone3.5:7.8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '4.8gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

const EXAONE3_5_32b = {
  name: 'exaone3.5:32b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '19gb',
  context: 32_000,
} as const satisfies ModelMeta<any>

export const EXAONE3_5MODELS = [
  EXAONE3_5_LATEST.name,
  EXAONE3_5_2_4b.name,
  EXAONE3_5_7_1b.name,
  EXAONE3_5_32b.name,
] as const

const EXAONE3_5IMAGE_MODELS = [] as const

export const EXAONE3_5EMBEDDING_MODELS = [] as const

const EXAONE3_5AUDIO_MODELS = [] as const

const EXAONE3_5VIDEO_MODELS = [] as const

// export type AyaChatModels = (typeof EXAONE3_5MODELS)[number]

// Manual type map for per-model provider options
export type Exaone3_5ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [EXAONE3_5_LATEST.name]: ChatRequest
  [EXAONE3_5_2_4b.name]: ChatRequest
  [EXAONE3_5_7_1b.name]: ChatRequest
  [EXAONE3_5_32b.name]: ChatRequest
}

export type Exaone3_5ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [EXAONE3_5_LATEST.name]: typeof EXAONE3_5_LATEST.supports.input
  [EXAONE3_5_2_4b.name]: typeof EXAONE3_5_2_4b.supports.input
  [EXAONE3_5_7_1b.name]: typeof EXAONE3_5_7_1b.supports.input
  [EXAONE3_5_32b.name]: typeof EXAONE3_5_32b.supports.input
}
