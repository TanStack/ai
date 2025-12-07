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

const PHI3_LATEST = {
  name: 'phi3:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2.2gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const PHI3_3_8b = {
  name: 'phi3:8b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '2.2gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const PHI3_14b = {
  name: 'phi3:14b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: [],
  },
  size: '7.9gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

export const PHI3_MODELS = [
  PHI3_LATEST.name,
  PHI3_3_8b.name,
  PHI3_14b.name,
] as const

const PHI3_IMAGE_MODELS = [] as const

export const PHI3_EMBEDDING_MODELS = [] as const

const PHI3_AUDIO_MODELS = [] as const

const PHI3_VIDEO_MODELS = [] as const

// export type Phi3ChatModels = (typeof PHI3_MODELS)[number]

// Manual type map for per-model provider options
export type Phi3ChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [PHI3_LATEST.name]: ChatRequest
  [PHI3_3_8b.name]: ChatRequest
  [PHI3_14b.name]: ChatRequest
}

export type Phi3ModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [PHI3_LATEST.name]: typeof PHI3_LATEST.supports.input
  [PHI3_3_8b.name]: typeof PHI3_3_8b.supports.input
  [PHI3_14b.name]: typeof PHI3_14b.supports.input
}
