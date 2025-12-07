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

const FIREFUNCTION_V2_LATEST = {
  name: 'firefunction-v2:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '40gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

const FIREFUNCTION_V2_70b = {
  name: 'firefunction-v2:70b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '40gb',
  context: 8_000,
} as const satisfies ModelMeta<any>

export const FIREFUNCTION_V2_MODELS = [
  FIREFUNCTION_V2_LATEST.name,
  FIREFUNCTION_V2_70b.name,
] as const

const FIREFUNCTION_V2_IMAGE_MODELS = [] as const

export const FIREFUNCTION_V2_EMBEDDING_MODELS = [] as const

const FIREFUNCTION_V2_AUDIO_MODELS = [] as const

const FIREFUNCTION_V2_VIDEO_MODELS = [] as const

// export type Firefunction_V2ChatModels = (typeof FIREFUNCTION_V2_MODELS)[number]

// Manual type map for per-model provider options
export type Firefunction_V2ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [FIREFUNCTION_V2_LATEST.name]: ChatRequest
  [FIREFUNCTION_V2_70b.name]: ChatRequest
}

export type Firefunction_V2ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [FIREFUNCTION_V2_LATEST.name]: typeof FIREFUNCTION_V2_LATEST.supports.input
  [FIREFUNCTION_V2_70b.name]: typeof FIREFUNCTION_V2_70b.supports.input
}
