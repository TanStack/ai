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

const MISTRAL_LARGE_LATEST = {
  name: 'mistral-large:latest',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '73gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

const MISTRAL_LARGE_123b = {
  name: 'mistral-large:123b',
  supports: {
    input: ['text'],
    output: ['text'],
    capabilities: ['tools'],
  },
  size: '73gb',
  context: 128_000,
} as const satisfies ModelMeta<any>

export const MISTRAL_LARGE_MODELS = [
  MISTRAL_LARGE_LATEST.name,
  MISTRAL_LARGE_123b.name,
] as const

const MISTRAL_LARGE_IMAGE_MODELS = [] as const

export const MISTRAL_LARGE_EMBEDDING_MODELS = [] as const

const MISTRAL_LARGE_AUDIO_MODELS = [] as const

const MISTRAL_LARGE_VIDEO_MODELS = [] as const

// export type MistralLargeChatModels = (typeof MISTRAL_LARGE_MODELS)[number]

// Manual type map for per-model provider options
export type MistralLargeChatModelProviderOptionsByName = {
  // Models with thinking and structured output support
  [MISTRAL_LARGE_LATEST.name]: ChatRequest
  [MISTRAL_LARGE_123b.name]: ChatRequest
}

export type MistralLargeModelInputModalitiesByName = {
  // Models with text, image, audio, video (no document)
  [MISTRAL_LARGE_LATEST.name]: typeof MISTRAL_LARGE_LATEST.supports.input
  [MISTRAL_LARGE_123b.name]: typeof MISTRAL_LARGE_123b.supports.input
}
