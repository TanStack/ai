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

const DEVSTRAL_LATEST = {
  name: 'devstral:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '14gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const DEVSTRAL_24b = {
  name: 'devstral:24b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '14gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

export const DEVSTRAL_MODELS = [
  DEVSTRAL_LATEST.name,
  DEVSTRAL_24b.name,
] as const

// const DEVSTRAL_IMAGE_MODELS = [] as const

// export const DEVSTRAL_EMBEDDING_MODELS = [] as const

// const DEVSTRAL_AUDIO_MODELS = [] as const

// const DEVSTRAL_VIDEO_MODELS = [] as const

// export type DevstralChatModels = (typeof DEVSTRAL_MODELS)[number]

// Manual type map for per-model provider options
export type DevstralChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [DEVSTRAL_LATEST.name]: ChatRequest
  [DEVSTRAL_24b.name]: ChatRequest
}

export type DevstralModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [DEVSTRAL_LATEST.name]: typeof DEVSTRAL_LATEST.supports.input
  [DEVSTRAL_24b.name]: typeof DEVSTRAL_24b.supports.input
}
